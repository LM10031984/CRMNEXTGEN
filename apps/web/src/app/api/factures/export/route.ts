/**
 * Route API export comptable xlsx — Phase 11 Plan 11-07 (FACT-04).
 *
 * GET /api/factures/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 *  - Auth : Lucia `validateRequest` → 401 si pas de session
 *  - RBAC : `hasRole(['ADMIN', 'COMPTABLE'])` → 403 sinon (D-17)
 *  - Zod : `ExportInvoicesQuerySchema.safeParse({ from, to })` → 400 si invalide
 *  - Query : `prisma.invoice.findMany` filtré par `tenantId` + `issueDate BETWEEN from AND to`.
 *    PAS de filter `status` (D-16 : avoirs CREDIT_NOTE inclus dans le même fichier
 *    avec montant HT négatif — déjà signé en BDD depuis Plan 11-05).
 *  - Mapping : `buildInvoiceExportRows` (helper pur testé séparément Task 1)
 *  - Encoding : `XLSX.utils.aoa_to_sheet` + `XLSX.write({ type: 'buffer', bookType: 'xlsx' })`
 *  - AuditLog : `logInvoiceEvent({ action: 'invoices.exported', targetInvoiceId: 'BULK',
 *    diff: { from, to, count } })` après écriture OK (D-18).
 *  - Filename : `factures_YYYY-MM-DD_YYYY-MM-DD.xlsx` (cohérent C1.i2_Bilan_Qualiopi Phase 3).
 *
 * Pattern : clone-strict `apps/web/src/app/api/qualiopi-bilan/export/route.ts` (Phase 3).
 *
 * Le bouton "Exporter" (Plan 11-08, à venir) link directement `<a href="...">` cette
 * route — pas besoin d'API JSON intermédiaire.
 */

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { prisma } from '@qualiof/db';
import { ExportInvoicesQuerySchema } from '@qualiof/shared';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import {
  buildInvoiceExportRows,
  type InvoiceExportInput,
} from '@/lib/invoice-export-builder';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  // 1) Auth + RBAC (D-17 — ADMIN + COMPTABLE uniquement)
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasRole(user, ['ADMIN', 'COMPTABLE'])) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 2) Zod parse query params (D-15)
  const url = new URL(req.url);
  const parsed = ExportInvoicesQuerySchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });
  if (!parsed.success) return new NextResponse('Bad request', { status: 400 });
  const { from, to } = parsed.data;

  // 3) Query Prisma (D-16 — avoirs INCLUS, pas de filter status)
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: user.tenantId,
      issueDate: { gte: from, lte: to },
    },
    select: {
      status: true,
      number: true,
      issueDate: true,
      amountHT: true,
      amountTTC: true,
      amountPaid: true,
      payerOrg: { select: { legalName: true, siret: true } },
      participant: {
        select: { person: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { issueDate: 'asc' },
  });

  // 4) Build rows via helper pur (D-14 — 12 colonnes verbatim)
  // Cast nécessaire : Prisma Decimal arrive ici typé en `Decimal` (objet runtime),
  // mais `Number(decimal)` fonctionne car Decimal implémente `valueOf()` →
  // l'`InvoiceExportInput` accepte `number | string` qui couvre les deux cas.
  const { headers, rows } = buildInvoiceExportRows(
    invoices as unknown as InvoiceExportInput[],
  );

  // 5) Construct xlsx sheet (clone-strict pattern Phase 3 qualiopi-bilan/export)
  const sheetData = [Array.from(headers), ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 12 }, // Date émission
    { wch: 14 }, // Numéro
    { wch: 6 }, // Type
    { wch: 30 }, // Libellé
    { wch: 28 }, // Payeur
    { wch: 16 }, // SIRET
    { wch: 12 }, // Montant HT
    { wch: 10 }, // TVA
    { wch: 12 }, // Montant TTC
    { wch: 10 }, // Payé
    { wch: 10 }, // Reste
    { wch: 12 }, // Statut
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Factures');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 6) AuditLog D-18 (action=invoices.exported, targetInvoiceId='BULK' convention)
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: 'BULK',
    action: 'invoices.exported',
    diff: {
      from: from.toISOString(),
      to: to.toISOString(),
      count: invoices.length,
    },
  });

  // 7) Response — filename pattern factures_YYYY-MM-DD_YYYY-MM-DD.xlsx
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="factures_${fromStr}_${toStr}.xlsx"`,
    },
  });
}
