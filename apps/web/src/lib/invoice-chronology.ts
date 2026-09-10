/**
 * Sentinelle de chronologie — l'alerte douce du §4 de la spec
 * `.planning/specs/2026-09-10-datation-numerotation-factures.md`.
 *
 * Elle répond à une seule question, juste avant qu'une pièce ne s'écrive :
 * « cette émission fait-elle RECULER la date par rapport au numéro
 * précédent ? ». Si oui, elle rend une phrase. Elle ne bloque rien : la
 * facture est émise, et l'utilisateur est informé après coup.
 *
 * ── Pourquoi elle ne parlera probablement jamais ────────────────────────
 *
 * Depuis le lot B (10/09/2026), toute pièce est datée d'AUJOURD'HUI. Une date
 * du jour n'est jamais antérieure à une pièce du passé : en usage normal,
 * `chronologyWarning` rend `null`, toujours.
 *
 * Ce n'est pas un contrôle courant, c'est une sentinelle. Elle ne se
 * déclenchera que dans deux cas, et ce sont exactement les deux qu'on veut
 * attraper :
 *  · une `issueDate` posée à la main en base ;
 *  · quelqu'un qui réintroduit une datation DÉRIVÉE (de la fin de session, de
 *    la date de convention, d'un import…) sans avoir lu l'en-tête de
 *    `invoice-dates.ts`.
 *
 * Un silence permanent est ici le résultat attendu, pas le signe d'un code
 * mort. C'est pour ça qu'elle reste.
 *
 * ── Pourquoi elle ne réutilise pas les helpers du script d'audit ────────
 *
 * `scripts/audit-invoice-chronology.ts` (lot A) exporte `parseSequenceNumber`
 * et `diffInDays`, purs et testés, qui font la MÊME arithmétique — y compris
 * la normalisation à minuit UTC reproduite ci-dessous. On ne les importe pas
 * pour autant : ce module-là importe `prisma` au premier niveau, et faire
 * dépendre `src/` d'un fichier de `scripts/` inverse la dépendance (le
 * livrable du lot A est déjà passé sur la production, il n'a pas à devenir une
 * brique du chemin d'écriture).
 *
 * Deux consommateurs distincts, donc, pour la même règle : un inventaire hors
 * ligne qui mesure le parc, une sentinelle dans le chemin d'écriture. La
 * duplication est de quatre lignes et elle est dite ici — si l'une des deux
 * change un jour, ce commentaire nomme l'autre.
 *
 * Module NEUTRE (ni 'use server' ni 'use client') : pur, synchrone, testable
 * sans base ni mock.
 */

const MS_PAR_JOUR = 86_400_000;

/**
 * Préfixe de séquence d'un numéro de pièce, TIRET COMPRIS (`'FAC-000032'` →
 * `'FAC-'`), directement utilisable en `startsWith` Prisma.
 *
 * Coupe au DERNIER tiret et n'accepte que des chiffres à droite — même lecture
 * que `parseSequenceNumber` du script d'audit, et pour la même raison : le
 * préfixe se lit sur le NUMÉRO qu'on vient d'obtenir, jamais sur le
 * paramétrage du tenant. Deux sources pour la même vérité finiraient par
 * diverger le jour où quelqu'un change `Tenant.invoicePrefix` : les pièces
 * historiques portant l'ancien préfixe sortiraient silencieusement du
 * périmètre de comparaison.
 *
 * Rend `null` sur tout ce qui n'est pas une séquence — un numéro hors format
 * n'a pas de prédécesseur identifiable, et on préfère se taire qu'inventer.
 */
export function sequencePrefixOf(number: string): string | null {
  const coupure = number.lastIndexOf('-');
  if (coupure <= 0 || coupure === number.length - 1) return null;

  const droite = number.slice(coupure + 1);
  if (!/^\d+$/.test(droite)) return null;

  return number.slice(0, coupure + 1);
}

/** Ramène une date à minuit UTC — l'heure n'a pas de sens sur une pièce comptable. */
function minuitUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** `jj/mm/aaaa` depuis les composantes UTC, cohérent avec `minuitUTC` ci-dessus. */
function jour(d: Date): string {
  const jj = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * La phrase à montrer si la date recule, `null` si tout va bien.
 *
 * La comparaison se fait en JOURS CALENDAIRES, bornes ramenées à minuit UTC :
 * deux pièces émises le même jour à des heures différentes ne sont pas une
 * rupture. Sans cette normalisation, facturer à 9 h après avoir facturé à 17 h
 * la veille au soir déclencherait une alerte pour rien.
 *
 * Un prédécesseur sans `issueDate` ne produit pas d'alerte : on ne compare pas
 * à ce qu'on ne connaît pas, et on n'invente pas une rupture.
 */
export function chronologyWarning(input: {
  number: string;
  issueDate: Date;
  previous: { number: string; issueDate: Date | null } | null;
}): string | null {
  const { number, issueDate, previous } = input;
  if (!previous?.issueDate) return null;

  const ecart = Math.round((minuitUTC(previous.issueDate) - minuitUTC(issueDate)) / MS_PAR_JOUR);
  if (ecart <= 0) return null;

  // Le ton compte : on informe, on ne refuse pas. L'utilisateur doit
  // comprendre que sa facture existe — sinon il re-clique, et le lot A
  // mesurera deux ruptures au lieu d'une.
  return (
    `Chronologie : ${number} est émise le ${jour(issueDate)}, ` +
    `soit ${ecart} jour${ecart > 1 ? 's' : ''} AVANT ${previous.number} ` +
    `(${jour(previous.issueDate)}). La facture est bien émise — ` +
    `signalez-le si vous ne l'avez pas voulu.`
  );
}
