/**
 * Inventaire des ruptures de chronologie du parc de factures — lot A de la
 * spec `.planning/specs/2026-09-10-datation-numerotation-factures.md`.
 *
 * ── Ce que ce script mesure ──────────────────────────────────────────────
 *
 * L'invariante du §4, mot pour mot :
 *
 *   Pour un tenant et un préfixe donnés, l'ordre des numéros suit l'ordre des
 *   `issueDate` : number(n) > number(n-1) ⟹ issueDate(n) >= issueDate(n-1).
 *
 * Une RUPTURE est un couple de numéros consécutifs dans une même séquence où
 * la date d'émission RECULE. Elle naît de deux horloges qui ne sont pas la
 * même : le numéro est attribué à l'instant du clic (`getNextInvoiceNumber`,
 * max + 1) pendant que la date vient de la fin de prestation
 * (`resolveInvoiceIssueDate`, décision du 13/08/2026). Facturer en septembre
 * une session de juin produit FAC-000021 daté du 12 juin juste après
 * FAC-000020 daté du 3 septembre.
 *
 * ── La règle qui commande tout le reste ──────────────────────────────────
 *
 * CE SCRIPT NE MODIFIE JAMAIS LA BASE. Il tourne sur la prod Supabase
 * (`DATABASE_URL` de la racine pointe le pooler) : toute exécution est une
 * lecture de production. Il n'a pas de mode --apply, il n'en aura pas, et si
 * l'argument est passé par réflexe il refuse de démarrer plutôt que de
 * l'ignorer en silence. Aucune primitive d'écriture Prisma n'existe dans ce
 * fichier — c'est vérifiable au grep, et c'est vérifié dans le plan.
 *
 * Il n'est pas non plus une gate : il sort en 0 même avec des ruptures. Il
 * informe, il ne bloque rien. Ce qu'il produit part chez l'expert-comptable
 * (spec §6), pas dans une CI.
 *
 *   pnpm invoices:audit-chronology                  # tout le parc
 *   pnpm invoices:audit-chronology --tenant=<uuid>  # un seul tenant
 *
 * Les helpers de détection sont purs et exportés : le test unitaire les
 * importe sans jamais toucher à la base.
 */

// ─── Contrats ─────────────────────────────────────────────────────────────

/** Une pièce, réduite à ce que l'invariante regarde. */
export type ChronologyRow = {
  number: string;
  issueDate: Date | null;
  createdAt: Date;
  /** `InvoiceStatus` — affiché pour distinguer un brouillon d'une pièce émise. */
  status: string;
};

/** Une rupture : le numéro fautif ET son prédécesseur, sinon le rapport n'est pas relisable. */
export type ChronologyBreak = {
  number: string;
  issueDate: Date;
  createdAt: Date;
  status: string;
  /** `createdAt − issueDate` : de combien la pièce est datée en arrière de son établissement réel. */
  antidatedDays: number;
  previousNumber: string;
  previousIssueDate: Date;
  /** `previousIssueDate − issueDate` : l'amplitude de la rupture. Toujours > 0. */
  backwardDays: number;
};

export type SequenceReport = {
  prefix: string;
  /** 'factures' | 'avoirs' | 'séquence hors paramétrage' */
  label: string;
  /** Pièces entrées dans la chaîne : numéro exploitable ET date d'émission. */
  counted: number;
  withoutIssueDate: string[];
  malformed: string[];
  breaks: ChronologyBreak[];
};

// ─── Helpers purs ─────────────────────────────────────────────────────────

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * `FAC-000021` → `{ prefix: 'FAC', seq: 21 }`. `F-202601-214` →
 * `{ prefix: 'F-202601', seq: 214 }`. Sinon `null`.
 *
 * Le préfixe est lu sur le NUMÉRO lui-même (tout ce qui précède le dernier
 * tiret), pas déduit du paramétrage du tenant : une pièce historique portant
 * un préfixe abandonné doit apparaître dans le rapport, pas disparaître du
 * périmètre.
 */
export function parseSequenceNumber(number: string): { prefix: string; seq: number } | null {
  const coupure = number.lastIndexOf('-');
  if (coupure <= 0 || coupure === number.length - 1) return null;

  const droite = number.slice(coupure + 1);
  if (!/^\d+$/.test(droite)) return null;

  const seq = Number.parseInt(droite, 10);
  if (!Number.isSafeInteger(seq)) return null;

  return { prefix: number.slice(0, coupure), seq };
}

/** Ramène une date à minuit UTC — l'heure n'a pas de sens sur une pièce comptable. */
function minuitUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Jours calendaires entre deux dates, bornes ramenées à minuit UTC. Entier
 * signé. Sans cette normalisation, l'heure de création introduirait des
 * demi-journées : une facture créée à 14 h serait « antidatée de 89,4 jours ».
 */
export function diffInDays(later: Date, earlier: Date): number {
  return Math.round((minuitUTC(later) - minuitUTC(earlier)) / MS_PAR_JOUR);
}

/**
 * Le cœur : trie par `seq` croissant, parcourt la chaîne, renvoie les reculs.
 *
 * Deux règles qui évitent les ruptures imaginaires :
 *  - une pièce sans `issueDate` est mise de côté et la comparaison ENJAMBE
 *    (le suivant se compare au dernier numéro inférieur PORTANT une date) ;
 *  - la comparaison se fait en jours calendaires, donc deux pièces du même
 *    jour émises à des heures différentes ne sont pas une rupture.
 *
 * Le curseur avance à chaque pièce datée, y compris après une rupture :
 * l'invariante porte sur des couples CONSÉCUTIFS, pas sur un maximum courant.
 */
export function auditSequence(
  prefix: string,
  label: string,
  rows: ChronologyRow[],
): SequenceReport {
  const malformed: string[] = [];
  const ordonnables: Array<{ row: ChronologyRow; seq: number }> = [];

  for (const row of rows) {
    const parsed = parseSequenceNumber(row.number);
    if (parsed === null) {
      malformed.push(row.number);
      continue;
    }
    ordonnables.push({ row, seq: parsed.seq });
  }

  ordonnables.sort((a, b) => a.seq - b.seq || a.row.number.localeCompare(b.row.number));

  const withoutIssueDate: string[] = [];
  const breaks: ChronologyBreak[] = [];
  let counted = 0;
  let precedent: { number: string; issueDate: Date } | null = null;

  for (const { row } of ordonnables) {
    const issueDate = row.issueDate;
    if (issueDate === null) {
      withoutIssueDate.push(row.number);
      continue;
    }
    counted++;

    if (precedent !== null) {
      const backwardDays = diffInDays(precedent.issueDate, issueDate);
      if (backwardDays > 0) {
        breaks.push({
          number: row.number,
          issueDate,
          createdAt: row.createdAt,
          status: row.status,
          antidatedDays: diffInDays(row.createdAt, issueDate),
          previousNumber: precedent.number,
          previousIssueDate: precedent.issueDate,
          backwardDays,
        });
      }
    }

    precedent = { number: row.number, issueDate };
  }

  return { prefix, label, counted, withoutIssueDate, malformed, breaks };
}
