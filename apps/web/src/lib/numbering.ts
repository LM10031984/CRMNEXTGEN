/**
 * Numérotation séquentielle factures (Phase 7 Plan 07-02 Task 2).
 *
 * Extrait depuis l'helper local `nextInvoiceNumber` qui vivait dans
 * `apps/web/src/server/actions/invoices.ts` et hardcodait le préfixe 'FAC-'.
 *
 * **Phase 7 D-06 — préfixe configurable depuis Paramètres** :
 * - lecture `Tenant.invoicePrefix` (fallback `'FAC'` cohérent avec le @default
 *   du schema Prisma)
 * - format `{prefix}-NNNNNN` (6 chiffres zero-padded — conservé per Finding 5
 *   RESEARCH.md, le volume Start Academy est < 100/an mais on garde 6 chiffres
 *   par cohérence avec l'historique)
 * - pas de "trou" : on prend le max courant et on +1 (sequence atomique sous
 *   transaction Prisma)
 *
 * **Usage atomique** :
 *   await prisma.$transaction(async (tx) => {
 *     const number = await getNextInvoiceNumber(tenantId, tx);
 *     return tx.invoice.create({ data: { number, ... } });
 *   });
 *
 * Passer `tx` est OBLIGATOIRE en création de facture pour éviter une race
 * condition entre 2 admins qui factureraient simultanément (sinon 2 factures
 * pourraient se retrouver avec le même numéro). `tx` optionnel reste utile
 * pour les écrans de preview / read-only.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@qualiof/db';

export async function getNextInvoiceNumber(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const db = tx ?? prisma;
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { invoicePrefix: true },
  });
  // Fallback cohérent avec `@default("FAC")` du schema Prisma + with helper pick
  // dans `of-config.ts resolveOfConfig`. Trim défensif au cas où la valeur BDD
  // contiendrait des espaces.
  const prefix = (tenant?.invoicePrefix ?? 'FAC').trim() || 'FAC';

  const last = await db.invoice.findFirst({
    where: { tenantId, number: { startsWith: `${prefix}-` } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const lastNum = last ? parseInt(last.number.replace(`${prefix}-`, ''), 10) || 0 : 0;
  return `${prefix}-${String(lastNum + 1).padStart(6, '0')}`;
}
