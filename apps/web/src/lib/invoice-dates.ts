/**
 * Règles de datation des factures.
 *
 * Module NEUTRE (ni 'use server' ni 'use client') : `invoices.ts` porte
 * `'use server'` et ne peut donc exporter que des fonctions async — or ces
 * règles sont synchrones et méritent d'être testées isolément.
 */

/**
 * Date portée par une facture : LE JOUR OÙ ELLE EST ÉTABLIE.
 *
 * ── Ce que la règle était, du 13/08/2026 au 10/09/2026 ───────────────────
 *
 * `resolveInvoiceIssueDate(sessionEndDate, now)` rendait la FIN DE LA
 * PRESTATION, avec une garde interdisant de dater dans le futur : si la
 * session n'était pas terminée — facturation à l'inscription depuis le wizard
 * étape 5 — on retombait sur le jour courant.
 *
 * ── Pourquoi elle avait été prise ───────────────────────────────────────
 *
 * Deux motifs réels, décision de Laurent du 13/08/2026 :
 *  1. c'est ce que Laurent inscrivait à la main sur ses factures avant que
 *     l'app ne les émette ;
 *  2. ça évitait deux dates contradictoires sur la pièce acquittée — « Date »
 *     en haut du document, « Fait à … le … » en bas.
 *
 * ── Pourquoi elle est révisée ───────────────────────────────────────────
 *
 * L'effet de bord était connu et ASSUMÉ : le commentaire de ce fichier le
 * disait noir sur blanc. Le numéro était attribué à l'instant du clic
 * (`getNextInvoiceNumber`, max + 1) pendant que la date venait de la fin de
 * session : deux horloges qui ne sont pas la même. Facturer en septembre trois
 * sessions de juin produisait FAC-000021 daté du 12 juin juste après
 * FAC-000020 daté du 3 septembre.
 *
 * Ce que la décision du 13/08 n'avait pas pesé, c'est le COÛT DE CONFORMITÉ de
 * cet effet de bord. Deux faits l'ont rendu payant :
 *  · l'inventaire du 10/09/2026 (`scripts/audit-invoice-chronology.ts`) a
 *    mesuré 5 ruptures sur 31 pièces ;
 *  · le Factur-X du lot 2 de `/facture-electronique` fige cette date dans un
 *    XML transmis à une plateforme d'État — mieux vaut que la règle soit juste
 *    avant qu'elle ne parte hors de l'app.
 *
 * ── Pourquoi les deux motifs de 13/08 sont ÉTEINTS, pas contournés ──────
 *
 *  1. la mention manuscrite n'a plus lieu d'être : c'est l'app qui émet la
 *     pièce, et elle l'émet le jour où on la lui demande ;
 *  2. la contradiction « Date » / « Fait à … le … » disparaît d'elle-même,
 *     puisque les deux valent désormais le jour d'émission (spec §3).
 *
 * On ne perd donc rien de ce que la règle protégeait.
 *
 * ── Où vit désormais la période d'exécution ─────────────────────────────
 *
 * Sur la LIGNE de facture (`InvoiceLine.label`, « Formation « … » — SES-0042 —
 * 21 h — du 01/06/2026 au 03/06/2026 — Jean DUPONT »), construite par
 * `buildTrainingLines` depuis le lot 1 e-invoicing, et dans le bloc
 * désignation du gabarit PDF (`invoice-template.ts`, « Dates : … »).
 *
 * C'est précisément parce que `Invoice` n'avait PAS de lignes avant le lot 1
 * que la date d'émission avait été détournée pour porter cette information.
 * Le lot 1 lui a donné un domicile ; le lot B lui rend la date.
 *
 * ── Une garde qui disparaît, et ce n'est pas un oubli ───────────────────
 *
 * La garde anti-date-future s'en va AVEC le paramètre : elle n'a plus d'objet,
 * `now` n'étant jamais dans le futur. Ce n'est pas une protection qu'on
 * retire, c'est une protection qui n'a plus rien à protéger.
 *
 * ── Trace ───────────────────────────────────────────────────────────────
 *
 *  · `.planning/specs/2026-09-10-datation-numerotation-factures.md` (§2, §3, §7)
 *  · `docs/comptabilite/note-chronologie-factures-2026.md` (la note opposable)
 *  · `docs/comptabilite/audit-chronologie-2026-09-10.txt` (l'inventaire brut)
 *
 * ── Le plancher ajouté le 21/09/2026 ────────────────────────────────────
 *
 * Le lot B avait raison sur le principe — la pièce se date du jour où on
 * l'établit — mais il laissait passer ce qu'aucune règle comptable n'admet :
 * facturer une prestation QUI N'A PAS ENCORE EU LIEU. Le 21/09, Laurent
 * prépare les documents formateur de SES-0111 (« Du surfeur au pilote »,
 * 28→29/09) et émet les 7 factures du groupe : elles sortent datées du 21,
 * pour une formation qui se termine huit jours plus tard.
 *
 * La date d'émission reçoit donc un PLANCHER : la fin de la formation.
 *
 *     émission = max(jour d'établissement, fin de formation)
 *
 * Les deux cas se lisent séparément :
 *  · formation TERMINÉE (le cas courant) — le plancher est déjà passé, la
 *    règle du lot B s'applique inchangée : la pièce porte le jour du clic, et
 *    la numérotation reste chronologique. Facturer en septembre une session de
 *    juin donne toujours une facture datée de septembre ;
 *  · formation À VENIR — la pièce porte la date de fin PRÉVUE, jamais un jour
 *    où la prestation n'était pas rendue.
 *
 * ⚠ CE QUE CE PLANCHER COÛTE, ET QUI DOIT ÊTRE SU. Il rouvre, de l'autre
 * côté, la faille que le lot B avait fermée : une pièce datée en avant peut
 * précéder en numéro une pièce datée plus tôt. Émettre aujourd'hui pour une
 * session qui finit le 29 (FAC-39 au 29/09), puis demain pour une session de
 * juin (FAC-40 au 22/09), redonne une rupture de chronologie. La parade n'est
 * PAS de rétablir l'ancienne règle — on ne facture pas avant d'avoir livré —
 * mais de ne pas émettre avant la fin : un garde-fou à l'émission (avertir, ou
 * refuser) est le chantier qui suit, et la note comptable doit être reprise en
 * conséquence.
 *
 * ── Trace ───────────────────────────────────────────────────────────────
 *
 *  · `.planning/specs/2026-09-10-datation-numerotation-factures.md` (§2, §3, §7)
 *  · `docs/comptabilite/note-chronologie-factures-2026.md` (la note opposable)
 *  · `docs/comptabilite/audit-chronologie-2026-09-10.txt` (l'inventaire brut)
 *
 * Les deux champs sont nommés plutôt que positionnels : la date passée en
 * premier argument a déjà désigné DEUX choses différentes dans l'histoire de
 * cette fonction (la fin de prestation jusqu'au 10/09, l'horloge de test
 * ensuite). Un objet interdit qu'un appelant se trompe de sens sans que le
 * compilateur le voie.
 */
export function resolveInvoiceIssueDate(
  input: { finDeFormation?: Date | null; now?: Date } = {},
): Date {
  const now = input.now ?? new Date();
  const fin = input.finDeFormation ?? null;
  // Sans date de fin connue, il n'y a pas de plancher à appliquer : on rend le
  // jour d'établissement, comme le lot B.
  if (fin === null) return now;
  return fin.getTime() > now.getTime() ? fin : now;
}

/**
 * Échéance de paiement : l'émission + le délai convenu.
 *
 * ⚠ Cette règle est INCHANGÉE par le lot B — elle était déjà juste. `dueDate`
 * a toujours été compté depuis le jour d'émission réel, y compris quand
 * `issueDate` valait la fin de prestation : sinon une facture rattrapée des
 * mois plus tard naîtrait déjà en retard et le cron de relances partirait tout
 * seul sur une pièce émise le matin même.
 *
 * Pourquoi elle est extraite ici, maintenant : jusqu'au lot B, l'écart entre
 * les deux règles se voyait à l'œil dans `invoices.ts` — `issueDate` venait de
 * la session, `dueDate` de `Date.now()`. Maintenant que l'émission vaut aussi
 * `now`, plus rien ne les distingue à la lecture d'un diff, et la prochaine
 * main qui « simplifie » les fusionnera. Une fonction nommée et un test qui dit
 * « l'échéance est ancrée sur l'émission » coûtent moins cher que la relance
 * automatique envoyée à un client le jour de sa facture.
 *
 * Corollaire de l'ancrage : les deux dates d'une même facture doivent partir du
 * MÊME instant. `invoices.ts` calcule `const emission = resolveInvoiceIssueDate()`
 * une fois, avant la transaction, et le passe ici — au lieu des deux `new Date()`
 * distincts d'avant, séparés de quelques millisecondes.
 */
export function resolveInvoiceDueDate(dueDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + dueDays * 86_400_000);
}
