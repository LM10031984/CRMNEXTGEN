/**
 * Clés de stockage des PDF de facturation.
 *
 * Module NEUTRE (ni 'use server' ni 'use client') : un fichier `'use server'`
 * ne peut exporter que des fonctions async, or ces helpers sont synchrones et
 * doivent être partagés entre la server action `invoices.ts` et les routes API
 * qui streament les fichiers.
 */

/**
 * Clé du duplicata ACQUITTÉ d'une facture (quick 260813-efh).
 *
 * DÉTERMINISTE à dessein : elle se recalcule à partir du seul numéro de
 * facture, donc la route de téléchargement la retrouve après un lookup scopé
 * `tenantId` — aucune clé ne transite par le client (pas d'IDOR) et aucune
 * colonne n'est nécessaire en base (pas de migration Prisma). Une
 * régénération écrase simplement la version précédente.
 */
export function acquittedInvoiceKey(invoiceNumber: string): string {
  return `factures/${invoiceNumber}-acquittee.pdf`;
}
