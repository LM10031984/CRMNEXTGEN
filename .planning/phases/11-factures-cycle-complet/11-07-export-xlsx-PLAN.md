---
phase: 11-factures-cycle-complet
plan: 07
type: execute
wave: 2
depends_on:
  - "11-02"
  - "11-04"
files_modified:
  - apps/web/src/lib/invoice-export-builder.ts
  - apps/web/src/lib/__tests__/invoice-export-builder.test.ts
  - apps/web/src/app/api/factures/export/route.ts
  - apps/web/src/app/api/factures/export/__tests__/route.test.ts
  - apps/web/src/server/actions/__tests__/invoices-export.test.ts
autonomous: true
requirements:
  - FACT-04
must_haves:
  truths:
    - "Route /api/factures/export GET retourne xlsx avec 12 colonnes pour la période filtrée."
    - "RBAC ADMIN+COMPTABLE uniquement (D-17 verbatim) — COMMERCIAL/FORMATEUR → 403."
    - "Avoirs (status=CREDIT_NOTE) inclus dans le même fichier avec amountHT négatif et Type=AVO (D-14 + D-16)."
    - "AuditLog invoices.exported créé après export OK."
    - "Filename pattern factures_YYYY-MM-DD_YYYY-MM-DD.xlsx."
  artifacts:
    - path: "apps/web/src/lib/invoice-export-builder.ts"
      provides: "Helper pur buildInvoiceExportRows(invoices) → [headers, rows] testable sans I/O"
      exports: ["buildInvoiceExportRows", "EXPORT_HEADERS"]
    - path: "apps/web/src/app/api/factures/export/route.ts"
      provides: "Route Next.js 14 GET retournant xlsx + Content-Type + Content-Disposition"
      exports: ["GET", "dynamic"]
  key_links:
    - from: "Bouton 'Exporter' UI Plan 11-08"
      to: "/api/factures/export?from=...&to=..."
      via: "<a href=> direct download"
      pattern: "factures/export"
    - from: "Route export"
      to: "logInvoiceEvent action='invoices.exported'"
      via: "import depuis @/lib/invoice-audit"
      pattern: "invoices.exported"
---

<objective>
Implémenter l'export comptable xlsx (FACT-04 + D-14..D-17). Route API `/api/factures/export` GET clone-strict `/api/qualiopi-bilan/export`. 12 colonnes fixes. Avoirs en négatif inclus dans le même export (solde net via SUM(HT) Excel). RBAC ADMIN+COMPTABLE only. AuditLog `invoices.exported` systématique. Helper pur `buildInvoiceExportRows` testable séparément.

Purpose: Le bouton "Exporter" (Plan 11-08) link directement vers cette route. Sans cette route, FACT-04 non couvert. Helper pur isolé du I/O simplifie les tests (peut être testé sans mocker la route entière).
Output: 1 helper + 1 route API + 3 suites Vitest vertes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/app/api/qualiopi-bilan/export/route.ts
@apps/web/src/lib/invoice-audit.ts
@apps/web/src/lib/rbac.ts
@apps/web/src/lib/auth.ts
@apps/web/src/lib/of-config.ts
@packages/shared/src/schemas/invoice.ts

<interfaces>
<!-- Helper pur (testable sans route) -->

```typescript
// apps/web/src/lib/invoice-export-builder.ts
export const EXPORT_HEADERS = [
  'Date émission', 'Numéro', 'Type', 'Libellé', 'Payeur', 'SIRET',
  'Montant HT', 'TVA', 'Montant TTC', 'Payé', 'Reste', 'Statut',
] as const;

export interface InvoiceExportInput {
  status: string;
  number: string;
  issueDate: Date | null;
  amountHT: number | string; // Decimal côté Prisma, stringified
  amountTTC: number | string;
  amountPaid: number | string;
  payerOrg: { legalName: string | null; siret: string | null } | null;
  participant: { person: { firstName: string; lastName: string } | null } | null;
}

export function buildInvoiceExportRows(invoices: InvoiceExportInput[]): {
  headers: typeof EXPORT_HEADERS;
  rows: (string | number)[][];
};
```

<!-- Route API -->
```typescript
// apps/web/src/app/api/factures/export/route.ts
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<NextResponse>;
// 401 sans session
// 403 si !hasRole(['ADMIN', 'COMPTABLE'])
// 400 si Zod parse fail
// 200 + Content-Type vnd.openxmlformats-officedocument.spreadsheetml.sheet + Content-Disposition attachment
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Helper pur buildInvoiceExportRows + tests</name>
  <files>apps/web/src/lib/invoice-export-builder.ts, apps/web/src/lib/__tests__/invoice-export-builder.test.ts</files>
  <read_first>
    - apps/web/src/app/api/qualiopi-bilan/export/route.ts (pattern xlsx Phase 3 — XLSX.utils.aoa_to_sheet + book_append_sheet)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Export Xlsx Spec + §Notes export
  </read_first>
  <behavior>
    - Test 1 : `buildInvoiceExportRows([])` → `{ headers: EXPORT_HEADERS, rows: [] }` (sheet vide accepté)
    - Test 2 : `EXPORT_HEADERS.length === 12` et contient verbatim les 12 colonnes D-14
    - Test 3 : Invoice status=ISSUED → row Type='FAC' + amountHT positif
    - Test 4 : Invoice status=CREDIT_NOTE → row Type='AVO' + amountHT négatif (déjà stocké négatif côté BDD)
    - Test 5 : Invoice avec participant.person → Libellé = "{firstName} {lastName}"
    - Test 6 : Invoice sans participant → Libellé = "Facture groupée"
    - Test 7 : SIRET vide si pas de payerOrg
    - Test 8 : Calcul TVA = amountTTC - amountHT
    - Test 9 : Calcul Reste = amountTTC - amountPaid
    - Test 10 : issueDate null → colonne vide (string '')
  </behavior>
  <action>
1. Créer `apps/web/src/lib/invoice-export-builder.ts` :

```typescript
export const EXPORT_HEADERS = [
  'Date émission',
  'Numéro',
  'Type',
  'Libellé',
  'Payeur',
  'SIRET',
  'Montant HT',
  'TVA',
  'Montant TTC',
  'Payé',
  'Reste',
  'Statut',
] as const;

export interface InvoiceExportInput {
  status: string;
  number: string;
  issueDate: Date | null;
  amountHT: number | string; // Decimal côté Prisma
  amountTTC: number | string;
  amountPaid: number | string;
  payerOrg: { legalName: string | null; siret: string | null } | null;
  participant: { person: { firstName: string; lastName: string } | null } | null;
}

export function buildInvoiceExportRows(invoices: InvoiceExportInput[]): {
  headers: typeof EXPORT_HEADERS;
  rows: (string | number)[][];
} {
  const rows = invoices.map((inv) => {
    const isAvoir = inv.status === 'CREDIT_NOTE';
    const libelle = inv.participant?.person
      ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
      : 'Facture groupée';
    const ht = Number(inv.amountHT);
    const ttc = Number(inv.amountTTC);
    const paid = Number(inv.amountPaid);
    return [
      inv.issueDate ? new Date(inv.issueDate).toISOString().slice(0, 10) : '',
      inv.number,
      isAvoir ? 'AVO' : 'FAC',
      libelle,
      inv.payerOrg?.legalName ?? '',
      inv.payerOrg?.siret ?? '',
      ht,
      ttc - ht, // TVA dérivée
      ttc,
      paid,
      ttc - paid, // Reste à encaisser
      inv.status,
    ];
  });

  return { headers: EXPORT_HEADERS, rows };
}
```

2. Créer `apps/web/src/lib/__tests__/invoice-export-builder.test.ts` avec 10 tests (cf behavior). Helper pur — pas de mock Prisma nécessaire.

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-export-builder.test.ts` → 10 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-export-builder.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/lib/invoice-export-builder.ts` existe (ls)
    - Exporte `EXPORT_HEADERS` avec exactement 12 strings (`EXPORT_HEADERS.length === 12` — grep cat tableau)
    - Headers verbatim D-14 : 'Date émission', 'Numéro', 'Type', 'Libellé', 'Payeur', 'SIRET', 'Montant HT', 'TVA', 'Montant TTC', 'Payé', 'Reste', 'Statut' (grep chacun)
    - Exporte `buildInvoiceExportRows(invoices: InvoiceExportInput[])` (grep signature)
    - Type='AVO' si `status === 'CREDIT_NOTE'`, sinon 'FAC' (grep `inv.status === 'CREDIT_NOTE'`)
    - Calcul TVA = amountTTC - amountHT (grep `ttc - ht`)
    - Calcul Reste = amountTTC - amountPaid (grep `ttc - paid`)
    - 10/10 tests verts
  </acceptance_criteria>
  <done>Helper pur testable isolément. La route le consomme dans Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 : Route API /api/factures/export GET + tests</name>
  <files>apps/web/src/app/api/factures/export/route.ts, apps/web/src/app/api/factures/export/__tests__/route.test.ts, apps/web/src/server/actions/__tests__/invoices-export.test.ts</files>
  <read_first>
    - apps/web/src/app/api/qualiopi-bilan/export/route.ts (pattern Next.js 14 route API à cloner — validateRequest + RBAC + XLSX.write + NextResponse)
    - apps/web/src/lib/auth.ts (validateRequest)
    - apps/web/src/lib/rbac.ts (hasRole — version sans throw pour pages/routes)
    - apps/web/src/lib/invoice-audit.ts (logInvoiceEvent Plan 11-02)
    - apps/web/src/lib/invoice-export-builder.ts (Task 1)
    - packages/shared/src/schemas/invoice.ts (ExportInvoicesQuerySchema Plan 11-04)
    - apps/web/src/server/actions/__tests__/invoices-export.test.ts (stub Wave 0 — 11 it.todo à remplir)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Export Xlsx Spec L788-887
  </read_first>
  <behavior>
    - Test 1 : GET sans session → 401
    - Test 2 : GET avec session COMMERCIAL → 403
    - Test 3 : GET avec session FORMATEUR → 403
    - Test 4 : GET avec session ADMIN → 200 + Content-Type xlsx
    - Test 5 : GET avec session COMPTABLE → 200
    - Test 6 : Content-Disposition contient `filename=factures_YYYY-MM-DD_YYYY-MM-DD.xlsx`
    - Test 7 : from/to invalides ou format incorrect → 400 (Bad request)
    - Test 8 : Crée AuditLog `invoices.exported` avec diff `{from, to, count}` après export
    - Test 9 : Période vide (0 factures) → 200 + sheet avec headers uniquement
    - Test 10 : Avoirs (status=CREDIT_NOTE) inclus dans la query (pas filtrés out)
    - Test 11 : `audit-log.targetInvoiceId = 'BULK'` pour export
  </behavior>
  <action>
1. Créer `apps/web/src/app/api/factures/export/route.ts` :

```typescript
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { prisma } from '@qualiof/db';
import { ExportInvoicesQuerySchema } from '@qualiof/shared';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { buildInvoiceExportRows } from '@/lib/invoice-export-builder';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasRole(user, ['ADMIN', 'COMPTABLE'])) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = ExportInvoicesQuerySchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });
  if (!parsed.success) return new NextResponse('Bad request', { status: 400 });
  const { from, to } = parsed.data;

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: user.tenantId,
      issueDate: { gte: from, lte: to },
      // D-16 : avoirs INCLUS (pas de filter status — on prend tout)
    },
    select: {
      status: true,
      number: true,
      issueDate: true,
      amountHT: true,
      amountTTC: true,
      amountPaid: true,
      payerOrg: { select: { legalName: true, siret: true } },
      participant: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { issueDate: 'asc' },
  });

  // Build rows via helper pur Plan 11-07 Task 1
  const { headers, rows } = buildInvoiceExportRows(
    invoices.map((inv) => ({
      status: inv.status,
      number: inv.number,
      issueDate: inv.issueDate,
      amountHT: inv.amountHT as never,
      amountTTC: inv.amountTTC as never,
      amountPaid: inv.amountPaid as never,
      payerOrg: inv.payerOrg,
      participant: inv.participant as never,
    })),
  );

  const sheetData = [Array.from(headers), ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 30 }, { wch: 28 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Factures');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // AuditLog D-18 (entity='Invoice', targetInvoiceId='BULK')
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: 'BULK',
    action: 'invoices.exported',
    diff: { from: from.toISOString(), to: to.toISOString(), count: invoices.length },
  });

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="factures_${fromStr}_${toStr}.xlsx"`,
    },
  });
}
```

2. Remplacer `apps/web/src/server/actions/__tests__/invoices-export.test.ts` (stub Wave 0) — c'est le fichier qui teste la route via mocks. Pattern :
   - Mock `validateRequest` (Lucia)
   - Mock `hasRole`
   - Mock `prisma.invoice.findMany`
   - Mock `logInvoiceEvent`
   - Importer la route handler `GET` puis appeler avec `new Request('http://localhost/api/factures/export?from=2026-01-01&to=2026-01-31')`
   - Assert le `NextResponse.status` + headers + body buffer

3. Créer aussi `apps/web/src/app/api/factures/export/__tests__/route.test.ts` (clone des tests dans `invoices-export.test.ts` — séparé pour respecter le listing Wave 0 — ou bien rediriger ce stub vers un import-only et garder les tests dans `invoices-export.test.ts`). 

**Décision** : centraliser les tests dans `invoices-export.test.ts` (chemin Wave 0 listé) et garder `route.test.ts` minimal avec un re-export ou un placeholder de cohérence. Pattern accepté : créer `route.test.ts` qui contient juste `import './../../../../../server/actions/__tests__/invoices-export.test'` OU déplacer les tests dans `route.test.ts` et mettre un placeholder dans `invoices-export.test.ts`.

**Implémentation choisie** : 11 tests dans `apps/web/src/app/api/factures/export/__tests__/route.test.ts` (où ils ont du sens — c'est une route), et `invoices-export.test.ts` redirige par import.

```typescript
// apps/web/src/server/actions/__tests__/invoices-export.test.ts
// Tests vivent dans la route — voir apps/web/src/app/api/factures/export/__tests__/route.test.ts
import './../../../app/api/factures/export/__tests__/route.test';
```

Plus simple : mettre tous les tests dans le fichier `invoices-export.test.ts` (chemin Wave 0 listé) et créer un `route.test.ts` minimal qui ne contient qu'un `it.todo('see invoices-export.test.ts')` ou un import de référence.

**Décision finale** : mettre les tests dans `route.test.ts` (chemin canonique) et faire de `invoices-export.test.ts` un re-export — c'est plus naturel pour Vitest collect. Mais comme `invoices-export.test.ts` est listé dans Wave 0 (11-VALIDATION.md), garder le fichier non-vide pour ne pas régresser le Nyquist gate. Solution : 11 tests vivent dans `route.test.ts`, et `invoices-export.test.ts` ne contient qu'un test smoke 1-liner qui vérifie l'export de la fonction `GET`.

```typescript
// invoices-export.test.ts (smoke pointer)
import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/factures/export/route';

describe('exportInvoicesXlsx (GET handler)', () => {
  it('exports a GET handler function', () => {
    expect(typeof GET).toBe('function');
  });
  // Full coverage in route.test.ts
});
```

4. Lancer : 
   - `pnpm --filter @qualiof/web test -- --run src/app/api/factures/export/__tests__/route.test.ts` → 11 verts
   - `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-export.test.ts` → vert (1 smoke)
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/app/api/factures/export/__tests__/route.test.ts && pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-export.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/api/factures/export/route.ts` existe avec `export const dynamic = 'force-dynamic'` (grep)
    - Exporte `GET(req: Request)` async (grep `export async function GET`)
    - Contient `hasRole(user, ['ADMIN', 'COMPTABLE'])` (grep verbatim — D-17)
    - Retourne 401 si `!user` (grep `status: 401`)
    - Retourne 403 si `!hasRole(...)` (grep `status: 403`)
    - Retourne 400 si Zod parse fail (grep `status: 400`)
    - Importe `buildInvoiceExportRows` depuis `@/lib/invoice-export-builder` (grep)
    - Importe `logInvoiceEvent` depuis `@/lib/invoice-audit` (grep)
    - Appelle `logInvoiceEvent` avec action `'invoices.exported'` et `targetInvoiceId: 'BULK'` (grep)
    - Filename pattern `factures_${fromStr}_${toStr}.xlsx` (grep)
    - `XLSX.utils.aoa_to_sheet` + `book_append_sheet(wb, ws, 'Factures')` (grep)
    - 11/11 tests route verts
    - 1+ test smoke `invoices-export.test.ts` vert
  </acceptance_criteria>
  <done>Route API opérationnelle, RBAC, AuditLog, 12 colonnes, avoirs inclus. Le bouton "Exporter" Plan 11-08 peut linker `<a href="/api/factures/export?from=...&to=...">`.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-export-builder.test.ts` → 10/10
- `pnpm --filter @qualiof/web test -- --run src/app/api/factures/export/__tests__/route.test.ts` → 11/11
- `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-export.test.ts` → 1/1
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web build` la route `/api/factures/export` compile
- **Manuel (cf 11-VALIDATION.md)** : ouvrir le xlsx généré dans Excel/Numbers → vérifier 12 colonnes + avoirs en négatif
</verification>

<success_criteria>
- Helper `buildInvoiceExportRows` pur testable
- Route GET `/api/factures/export` opérationnelle
- RBAC ADMIN+COMPTABLE only (D-17)
- 12 colonnes verbatim D-14
- Avoirs inclus avec amountHT négatif
- AuditLog `invoices.exported` créé
- 22 tests Vitest verts (10 + 11 + 1)
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-07-SUMMARY.md`
</output>
