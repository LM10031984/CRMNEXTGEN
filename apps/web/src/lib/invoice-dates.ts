/**
 * Règles de datation des factures.
 *
 * Module NEUTRE (ni 'use server' ni 'use client') : `invoices.ts` porte
 * `'use server'` et ne peut donc exporter que des fonctions async — or cette
 * règle est synchrone et mérite d'être testée isolément.
 */

/**
 * Date portée par une facture de formation (décision Laurent 13/08/2026).
 *
 * Une facture se date de la FIN DE LA PRESTATION, pas du jour où on clique
 * dans l'app : c'est ce que Laurent inscrivait à la main, et ça évite deux
 * dates contradictoires sur la pièce acquittée (« Date » en haut du document,
 * « Fait à … le … » en bas).
 *
 * Garde : on ne date JAMAIS une facture dans le futur. Si la session n'est pas
 * encore terminée — facturation à l'inscription depuis le wizard étape 5 — on
 * retombe sur la date du jour.
 *
 * ⚠ Effet de bord assumé : facturer en août une session de juin produit une
 * facture antérieure à la précédente, donc une numérotation qui n'est plus
 * dans l'ordre chronologique. Signalé à Laurent, qui a tranché pour la règle.
 *
 * Le délai de paiement (`dueDate`), lui, reste compté depuis le jour
 * d'émission réel : sinon une facture rattrapée des mois plus tard naîtrait
 * déjà en retard et déclencherait le cron de relances.
 */
export function resolveInvoiceIssueDate(
  sessionEndDate: Date | null | undefined,
  now: Date = new Date(),
): Date {
  if (!sessionEndDate) return now;
  return sessionEndDate.getTime() > now.getTime() ? now : sessionEndDate;
}
