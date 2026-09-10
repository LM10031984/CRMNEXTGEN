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

import { prisma } from '@qualiof/db';
import { pathToFileURL } from 'node:url';

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

// ─── Mise en page ─────────────────────────────────────────────────────────

const dateFR = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const horodatageFR = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

function jour(d: Date): string {
  return dateFR.format(d);
}

function jours(n: number): string {
  return `${n} j`;
}

/**
 * Une cellule ne déborde jamais de sa colonne : un nom de tenant un peu long
 * décalait toute la ligne du résumé, et un tableau désaligné dans une pièce
 * envoyée à l'expert-comptable ne se lit pas.
 */
function cellule(texte: string, largeur: number): string {
  return texte.length > largeur ? `${texte.slice(0, largeur - 1)}…` : texte.padEnd(largeur);
}

function row(cells: string[], widths: number[]): string {
  return cells.map((c, i) => cellule(c, widths[i] ?? 20)).join(' │ ');
}

/**
 * Vert uniquement en terminal. Ce rapport a vocation à être redirigé dans un
 * fichier joint à un mail : des séquences d'échappement ANSI dans une pièce
 * envoyée à l'expert-comptable seraient du bruit illisible.
 */
const ESC = String.fromCharCode(27);
function vert(texte: string): string {
  return process.stdout.isTTY ? `${ESC}[32m${texte}${ESC}[0m` : texte;
}

const LARGEURS = [12, 10, 15, 16, 12, 12, 10, 13];
const EN_TETES = [
  'Numéro',
  'Statut',
  "Date d'émission",
  'Date de création',
  'Antidatée de',
  'Précédent',
  'Émis le',
  'Recul / préc.',
];
const LARGEUR_TOTALE = LARGEURS.reduce((s, w) => s + w, 0) + 3 * (LARGEURS.length - 1);

/** Préfixe de convenance du seau « numéros que personne ne peut ordonner ». */
const HORS_FORMAT_PREFIX = '—';

function afficheSequence(rapport: SequenceReport): void {
  const horsFormat = rapport.prefix === HORS_FORMAT_PREFIX;
  const nomSequence = horsFormat ? rapport.label : `${rapport.label} (${rapport.prefix}-)`;
  console.log('');
  console.log(`── ${nomSequence} ${'─'.repeat(Math.max(0, 60 - nomSequence.length))}`);

  // Ici il n'y a rien à ordonner : annoncer « aucune rupture » serait rendre un
  // verdict de chronologie sur des numéros dont on ignore l'ordre.
  if (horsFormat) {
    console.log(
      `   ⚠ ${rapport.malformed.length} numéro(s) hors de toute chaîne, non ordonnable(s) : ${rapport.malformed.join(', ')}`,
    );
    return;
  }

  console.log(`   ${rapport.counted} pièce(s) dans la chaîne · ${rapport.breaks.length} rupture(s)`);

  if (rapport.breaks.length === 0) {
    console.log(vert('   ✓ Aucune rupture : les dates suivent les numéros.'));
  } else {
    console.log('');
    console.log(`   ${row(EN_TETES, LARGEURS)}`);
    console.log(`   ${'─'.repeat(LARGEUR_TOTALE)}`);
    for (const b of rapport.breaks) {
      console.log(
        `   ${row(
          [
            b.number,
            b.status,
            jour(b.issueDate),
            jour(b.createdAt),
            jours(b.antidatedDays),
            b.previousNumber,
            jour(b.previousIssueDate),
            jours(b.backwardDays),
          ],
          LARGEURS,
        )}`,
      );
    }
  }

  if (rapport.withoutIssueDate.length > 0) {
    console.log(
      `   ⚠ ${rapport.withoutIssueDate.length} pièce(s) sans date d'émission, hors chaîne : ${rapport.withoutIssueDate.join(', ')}`,
    );
  }
  if (rapport.malformed.length > 0) {
    console.log(
      `   ⚠ ${rapport.malformed.length} numéro(s) non ordonnable(s) : ${rapport.malformed.join(', ')}`,
    );
  }
}

// ─── Lecture (et rien d'autre) ────────────────────────────────────────────

/**
 * Range les pièces d'un tenant par séquence, puis passe chaque séquence au
 * détecteur. Les numéros illisibles vont dans un seau à part : les ranger
 * d'autorité sous le préfixe des factures reviendrait à inventer une donnée.
 *
 * Le libellé vient du paramétrage du tenant, mais le PÉRIMÈTRE vient des
 * numéros : une séquence portant un préfixe qui n'est plus celui configuré
 * est reportée sous « séquence hors paramétrage » — signalée, jamais
 * silencieuse.
 */
export function auditTenant(
  rows: ChronologyRow[],
  invoicePrefix: string,
  creditNotePrefix: string,
): SequenceReport[] {
  const parPrefixe = new Map<string, ChronologyRow[]>();
  const horsFormat: ChronologyRow[] = [];

  for (const r of rows) {
    const parsed = parseSequenceNumber(r.number);
    if (parsed === null) {
      horsFormat.push(r);
      continue;
    }
    const seau = parPrefixe.get(parsed.prefix);
    if (seau) seau.push(r);
    else parPrefixe.set(parsed.prefix, [r]);
  }

  const rang = (p: string): number => (p === invoicePrefix ? 0 : p === creditNotePrefix ? 1 : 2);
  const prefixes = [...parPrefixe.keys()].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));

  const rapports = prefixes.map((p) => {
    const label =
      p === invoicePrefix
        ? 'factures'
        : p === creditNotePrefix
          ? 'avoirs'
          : 'séquence hors paramétrage';
    return auditSequence(p, label, parPrefixe.get(p) ?? []);
  });

  if (horsFormat.length > 0) {
    rapports.push(auditSequence(HORS_FORMAT_PREFIX, 'numéros hors format', horsFormat));
  }
  return rapports;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // D-A1 — le réflexe de la main est de taper --apply (les scripts voisins en
  // ont un). Ici il n'y a rien à appliquer : on refuse plutôt que d'ignorer.
  if (args.includes('--apply')) {
    console.error("Ce script n'écrit jamais : il n'a pas de mode --apply.");
    process.exitCode = 1;
    return;
  }

  const tenantId = args.find((a) => a.startsWith('--tenant='))?.slice('--tenant='.length) ?? null;
  const inconnus = args.filter((a) => !a.startsWith('--tenant='));
  if (inconnus.length > 0) {
    throw new Error(`Argument inconnu : ${inconnus.join(', ')}`);
  }

  console.log('━'.repeat(LARGEUR_TOTALE + 3));
  console.log(' INVENTAIRE — chronologie des numéros de facture');
  console.log('━'.repeat(LARGEUR_TOTALE + 3));
  console.log(' Invariante (spec §4) : number(n) > number(n-1) ⟹ issueDate(n) >= issueDate(n-1)');
  console.log(' Lecture seule — ce script ne modifie rien et ne peut rien modifier.');
  console.log(` Généré le ${horodatageFR.format(new Date())}`);
  if (tenantId) console.log(` Périmètre : tenant ${tenantId}`);

  const tenants = await prisma.tenant.findMany({
    where: tenantId ? { id: tenantId } : {},
    select: { id: true, name: true, invoicePrefix: true, creditNotePrefix: true },
    orderBy: { name: 'asc' },
  });

  if (tenants.length === 0) {
    console.log('');
    console.log(
      tenantId ? `⚠ Aucun tenant avec l'id ${tenantId}.` : '⚠ Aucun tenant dans cette base.',
    );
    return;
  }

  let totalPieces = 0;
  let totalRuptures = 0;
  const lignesResume: Array<{
    sequence: string;
    counted: number;
    breaks: number;
    sansDate: number;
    horsFormat: number;
  }> = [];

  for (const tenant of tenants) {
    // Fallbacks alignés sur les @default du schema Prisma et sur numbering.ts.
    const invoicePrefix = (tenant.invoicePrefix ?? 'FAC').trim() || 'FAC';
    const creditNotePrefix = (tenant.creditNotePrefix ?? 'AVO').trim() || 'AVO';

    const invoices = await prisma.invoice.findMany({
      where: { tenantId: tenant.id },
      select: { number: true, issueDate: true, createdAt: true, status: true },
    });

    console.log('');
    console.log(`◆ ${tenant.name} — ${invoices.length} pièce(s)`);
    totalPieces += invoices.length;

    if (invoices.length === 0) {
      console.log('   (aucune facture)');
      continue;
    }

    for (const rapport of auditTenant(invoices, invoicePrefix, creditNotePrefix)) {
      afficheSequence(rapport);
      totalRuptures += rapport.breaks.length;
      lignesResume.push({
        sequence:
          rapport.prefix === HORS_FORMAT_PREFIX
            ? `${tenant.name} · ${rapport.label}`
            : `${tenant.name} · ${rapport.label} (${rapport.prefix}-)`,
        counted: rapport.counted,
        breaks: rapport.breaks.length,
        sansDate: rapport.withoutIssueDate.length,
        horsFormat: rapport.malformed.length,
      });
    }
  }

  const wResume = [52, 11, 10, 11, 12];
  console.log('');
  console.log('━━━ RÉSUMÉ ' + '━'.repeat(LARGEUR_TOTALE - 8));
  console.log('  ' + row(['Séquence', 'Examinées', 'Ruptures', 'Sans date', 'Hors format'], wResume));
  console.log('  ' + '─'.repeat(wResume.reduce((s, w) => s + w, 0) + 3 * (wResume.length - 1)));
  for (const l of lignesResume) {
    console.log(
      '  ' +
        row(
          [
            l.sequence,
            String(l.counted),
            String(l.breaks),
            String(l.sansDate),
            String(l.horsFormat),
          ],
          wResume,
        ),
    );
  }

  console.log('');
  console.log('  Pour joindre ce rapport au mail, rediriger la sortie dans un fichier :');
  console.log('      pnpm invoices:audit-chronology > audit-chronologie.txt');
  console.log('');
  console.log("  À recopier tel quel dans la question posée à l'expert-comptable (spec §6) :");
  console.log('');
  console.log(`      ${totalRuptures} ruptures sur ${totalPieces} pièces`);
  console.log('');
}

// Garde : main() (accès BDD de production) ne s'exécute que lancé directement,
// jamais à l'import — le test unitaire importe parseSequenceNumber,
// diffInDays et auditSequence sans jamais ouvrir une connexion.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  main()
    .catch((e) => {
      console.error('✗ Erreur :', e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
