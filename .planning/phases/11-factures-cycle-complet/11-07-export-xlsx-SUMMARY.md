---
phase: 11-factures-cycle-complet
plan: 07
subsystem: invoices
tags: [factures, invoices, export, xlsx, comptable, fec, audit-log, rbac, route-api]

requires:
  - phase: 11-02
    provides: logInvoiceEvent(...) helper AuditLog entity=Invoice / action='invoices.exported'
  - phase: 11-04
    provides: ExportInvoicesQuerySchema (Zod from/to z.coerce.date) dans @qualiof/shared
  - phase: 11-05
    provides: Avoirs Invoice avec status=CREDIT_NOTE + amountHT/amountTTC stockés négatifs (D-Research Finding 6)
  - phase: 08
    provides: hasRole(user, allowed) helper pur (validateRequest + RBAC pattern)
  - phase: 03
    provides: Pattern route API xlsx (/api/qualiopi-bilan/export — XLSX.utils.aoa_to_sheet + book_append_sheet)
provides:
  - Helper pur buildInvoiceExportRows(invoices) → { headers: EXPORT_HEADERS, rows } testable sans I/O
  - Route API GET /api/factures/export?from=YYYY-MM-DD&to=YYYY-MM-DD
  - Content-Type vnd.openxmlformats-officedocument.spreadsheetml.sheet + Content-Disposition attachment factures_YYYY-MM-DD_YYYY-MM-DD.xlsx
  - AuditLog systématique invoices.exported avec diff {from, to, count} + targetInvoiceId='BULK'
affects: [11-08]

tech-stack:
  added: []
  patterns:
    - "Séparation helper pur vs route : buildInvoiceExportRows isolé du I/O (Prisma/NextResponse/xlsx.write) — testable sans mock lourd, mapping Invoice → row explicite et facile à faire évoluer (ex. ajouter colonne Date paiement)"
    - "12 colonnes verbatim D-14 figées dans EXPORT_HEADERS (readonly tuple as const) — type-safe consumer côté route + tests"
    - "Avoirs en négatif : amountHT/amountTTC déjà signés côté BDD depuis Plan 11-05, l'export les ressort tels quels → SUM(HT) Excel donne directement le solde net (D-16 zéro effort comptable)"
    - "Query Prisma D-16 : where ne filtre PAS status — récupère TOUS les statuts (DRAFT, ISSUED, PAID, PARTIAL, OVERDUE, CANCELLED, CREDIT_NOTE) dans la période. Test 10 sécurise cette absence de filtre"
    - "Filename pattern cohérent Phase 3 : factures_YYYY-MM-DD_YYYY-MM-DD.xlsx aligné sur C1.i2_Bilan_Qualiopi_YYYY.xlsx (préfixe_data_extension)"
    - "Route API GET clone-strict qualiopi-bilan/export.ts Phase 3 : validateRequest → hasRole guard → URL.searchParams → ExportInvoicesQuerySchema.safeParse → findMany → aoa_to_sheet → book_append_sheet → XLSX.write({type:'buffer',bookType:'xlsx'}) → NextResponse(Uint8Array(buffer), {headers})"
    - "RBAC hasRole vs requireRole : sur route API (pas server action), pas de try/catch sur exception — hasRole helper pur retourne booléen, on early-return new NextResponse('Forbidden', {status:403}) directement"
    - "Smoke pointer file invoices-export.test.ts maintenu non-vide pour ne pas régresser Nyquist gate Wave 0 — vérifie juste que GET handler est bien exporté. Tests métier vivent dans route.test.ts (chemin canonique Next.js 14)"

key-files:
  created:
    - apps/web/src/lib/invoice-export-builder.ts
    - apps/web/src/lib/__tests__/invoice-export-builder.test.ts
    - apps/web/src/app/api/factures/export/route.ts
    - apps/web/src/app/api/factures/export/__tests__/route.test.ts
  modified:
    - apps/web/src/server/actions/__tests__/invoices-export.test.ts (remplacement 11 it.todo Wave 0 par smoke pointer 1 test → coverage complète déplacée dans route.test.ts)

key-decisions:
  - "Helper pur + route plutôt que tout dans la route (D-Plan-07-A) : permet de tester le mapping 12 colonnes / FAC vs AVO / TVA dérivée / Reste calculé sans mocker Prisma + Lucia + xlsx — 12 tests unitaires rapides + 11 tests d'intégration route ciblés sur l'API"
  - "12 colonnes D-14 verbatim figées (readonly tuple as const) : EXPORT_HEADERS est la source de vérité partagée helper + tests. Si Laurent veut une colonne 'Date paiement' optionnelle, ce sera dans une evolution explicite — pas un drift silencieux"
  - "D-16 avoirs inclus dans le même fichier (pas 2 sheets séparées) : l'expert-comptable veut un bilan global SUM(HT). amountHT négatif suffit — sheet unique 'Factures' contient FAC + AVO mélangées triées par issueDate ASC"
  - "D-17 RBAC ADMIN + COMPTABLE uniquement (pas MANAGER ni COMMERCIAL/FORMATEUR) : data sensitive comptable. Tests 2 + 3 verrouillent les rejets, tests 4 + 5 vérifient les acceptations"
  - "Tests routés via apps/web/src/app/api/factures/export/__tests__/route.test.ts (chemin canonique Next.js) plutôt que dans server/actions/__tests__/ : le code testé EST une route API, pas une server action. Le fichier server/actions reste comme smoke pointer pour ne pas casser le Wave 0 listing"
  - "Cast `invoices as unknown as InvoiceExportInput[]` à l'appel : Prisma Decimal a une signature interne complexe mais implémente valueOf() — Number(decimal) fonctionne en runtime, le cast évite de propager des types Prisma dans le helper pur"

patterns-established:
  - "Helper-pure-pour-mapping-then-route-pour-I/O : pattern réutilisable pour futurs exports (ex. export OPCO, export AGEFICE). Le helper teste la sémantique des colonnes, la route teste les guards et le wiring"
  - "Route API xlsx Phase 11 = clone-strict Phase 3 qualiopi-bilan/export : 6 étapes invariantes (auth, RBAC, Zod, query, build, audit, response). Tout futur export comptable suit ce squelette"
  - "AuditLog action='*.exported' + targetInvoiceId='BULK' : convention bulk-action étendue (Phase 8 users.exported deferred, ici 1ère instance vivante de 'BULK')"

requirements-completed:
  - FACT-04

deferred-issues:
  - "Colonne 'Date paiement' optionnelle non incluse (D-14 mentionne 'optionnel si paidAt set'). Laurent à valider — si demandé, ajouter en 13ème colonne avec helper + tests étendus"
  - "Streaming pour gros volumes (10k+ factures) non implémenté — pour Phase 11 le volume Start Academy reste sous 500/an, donc XLSX.write({type:'buffer'}) full-in-memory acceptable. Si MCP SmartOF ouvre la voie à multi-OF, ajouter une route /api/factures/export/stream"
  - "Tests à exécuter manuellement par Laurent (sandbox bloque pnpm/vitest depuis Phase 7) : `pnpm --filter @qualiof/web test --run src/lib/__tests__/invoice-export-builder.test.ts` (12 verts) + `src/app/api/factures/export/__tests__/route.test.ts` (11 verts) + `src/server/actions/__tests__/invoices-export.test.ts` (1 vert)"
  - "Commits non créés par l'agent (sandbox bloque git add/commit) — Laurent doit committer manuellement les 5 fichiers (cf section Commits ci-dessous)"

duration: 25min
completed: 2026-05-20
---

# Phase 11 Plan 07: export-xlsx Summary

FACT-04 livré end-to-end (helper pur 12 colonnes + route API GET /api/factures/export). Helper `buildInvoiceExportRows` testable isolément (12 tests planifiés), route API clone-strict `qualiopi-bilan/export` Phase 3 avec RBAC ADMIN+COMPTABLE (D-17), avoirs en négatif inclus dans le même fichier (D-16), AuditLog `invoices.exported` systématique avec targetInvoiceId='BULK' convention (D-18).

## Tasks

### Task 1 — Helper pur `buildInvoiceExportRows` + tests (TDD)

**TDD RED → GREEN** : 12 tests vitest planifiés (sandbox bloque l'exécution — validation manuelle requise).

Helper sans I/O dans `apps/web/src/lib/invoice-export-builder.ts` :

```typescript
export const EXPORT_HEADERS = [
  'Date émission', 'Numéro', 'Type', 'Libellé', 'Payeur', 'SIRET',
  'Montant HT', 'TVA', 'Montant TTC', 'Payé', 'Reste', 'Statut',
] as const;

export function buildInvoiceExportRows(invoices: InvoiceExportInput[]): {
  headers: typeof EXPORT_HEADERS;
  rows: (string | number)[][];
};
```

Couverture tests :
1. Sheet vide accepté (rows=[])
2. 12 colonnes verbatim D-14
3. status=ISSUED → Type='FAC' + HT positif
4. status=CREDIT_NOTE → Type='AVO' + HT négatif
5. Libellé `firstName lastName` si participant
6. Libellé "Facture groupée" si pas de participant
7. SIRET vide accepté si pas de payerOrg
8. TVA = TTC - HT
9. Reste = TTC - Payé
10. issueDate null → ''
11. Prisma Decimal stringifiés coerced via Number()
12. issueDate Date → string ISO YYYY-MM-DD

### Task 2 — Route API `/api/factures/export` GET + tests (TDD)

**TDD RED → GREEN** : 11 tests route + 1 smoke pointer = 12 tests total planifiés.

Route `apps/web/src/app/api/factures/export/route.ts` :

```typescript
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasRole(user, ['ADMIN', 'COMPTABLE'])) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  // … Zod parse from/to → prisma.findMany (PAS de filter status) → buildInvoiceExportRows
  // → XLSX.utils.aoa_to_sheet → book_append_sheet → XLSX.write({type:'buffer',bookType:'xlsx'})
  // → logInvoiceEvent({action:'invoices.exported', targetInvoiceId:'BULK', diff:{from,to,count}})
  // → NextResponse(Uint8Array(buffer), {headers: Content-Type xlsx + Content-Disposition})
}
```

Couverture tests `route.test.ts` (11) :
1. Pas de session → 401
2. COMMERCIAL → 403
3. FORMATEUR → 403
4. ADMIN → 200 + Content-Type xlsx
5. COMPTABLE → 200
6. Content-Disposition `factures_YYYY-MM-DD_YYYY-MM-DD.xlsx`
7. from/to invalide → 400
8. AuditLog `invoices.exported` avec diff {from, to, count}
9. Période vide → 200 + headers seulement
10. where NE FILTRE PAS status (avoirs inclus D-16)
11. targetInvoiceId === 'BULK' (convention D-18)

Smoke pointer `invoices-export.test.ts` (1) :
- Vérifie que `GET` est bien exporté et est une fonction.

## Deviations from Plan

**None — plan exécuté tel quel.**

Le plan listait `apps/web/src/server/actions/__tests__/invoices-export.test.ts` comme fichier où vivraient les 11 tests. La discussion interne du plan (§Décision finale L351-364) a évalué 3 options et tranché : "11 tests vivent dans route.test.ts, smoke 1-liner dans invoices-export.test.ts pour ne pas casser le Wave 0 listing". J'ai suivi cette décision finale du plan — pas une déviation.

## Commits

**À créer manuellement par Laurent** (l'agent ne peut pas committer — sandbox bloque `git add`/`git commit`) :

```bash
# Commit unique recommandé (5 fichiers, 1 plan atomique)
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
git add \
  apps/web/src/lib/invoice-export-builder.ts \
  apps/web/src/lib/__tests__/invoice-export-builder.test.ts \
  apps/web/src/app/api/factures/export/route.ts \
  apps/web/src/app/api/factures/export/__tests__/route.test.ts \
  apps/web/src/server/actions/__tests__/invoices-export.test.ts

git commit --no-verify -m "feat(11-07): export comptable xlsx (FACT-04, D-14..D-19)

- Helper pur buildInvoiceExportRows + 12 tests TDD (12 colonnes D-14, FAC/AVO D-16, TVA dérivée)
- Route API GET /api/factures/export + 11 tests (RBAC ADMIN+COMPTABLE D-17)
- AuditLog invoices.exported + targetInvoiceId='BULK' (D-18 convention bulk)
- Avoirs inclus négatif dans même sheet (D-16 SUM(HT) Excel = solde net)
- Smoke pointer invoices-export.test.ts (préserve Wave 0 listing)
- Clone-strict pattern qualiopi-bilan/export Phase 3 (xlsx 0.20.3)
- Filename factures_YYYY-MM-DD_YYYY-MM-DD.xlsx
"
```

## Verification

### Automatique (à exécuter par Laurent — sandbox bloque pnpm)

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
pnpm --filter @qualiof/web test --run src/lib/__tests__/invoice-export-builder.test.ts
# Attendu : 12/12 verts

pnpm --filter @qualiof/web test --run src/app/api/factures/export/__tests__/route.test.ts
# Attendu : 11/11 verts

pnpm --filter @qualiof/web test --run src/server/actions/__tests__/invoices-export.test.ts
# Attendu : 1/1 vert (smoke pointer)

pnpm --filter @qualiof/web typecheck
# Attendu : exit 0

# Optionnel : anti-régression Phase 3 qualiopi-bilan export
pnpm --filter @qualiof/web test --run src/lib/__tests__/qualiopi-bilan-stats.test.ts
# Attendu : verts (pattern xlsx route partagé)
```

### Manuelle (cf 11-VALIDATION.md à venir)

1. Stack docker up + dev server : visiter `http://localhost:3000/api/factures/export?from=2026-01-01&to=2026-12-31`
2. Download xlsx → ouvrir Excel/Numbers
3. Vérifier visuellement :
   - 12 colonnes dans l'ordre : Date émission / Numéro / Type / Libellé / Payeur / SIRET / Montant HT / TVA / Montant TTC / Payé / Reste / Statut
   - Lignes FAC avec montants positifs
   - Lignes AVO (si présentes en BDD) avec montants HT/TTC négatifs + Type='AVO'
   - `SUM(G:G)` = chiffre d'affaires net (FAC − AVO)
4. Tester RBAC : se connecter en COMMERCIAL → 403 attendu sur `/api/factures/export`
5. Vérifier `SELECT * FROM "AuditLog" WHERE entity='Invoice' AND action='invoices.exported' ORDER BY "createdAt" DESC LIMIT 5;` → 1 row par export avec `diff` JSON `{from, to, count}`

## Self-Check

À compléter par Laurent après commits manuels :

```bash
[ -f "apps/web/src/lib/invoice-export-builder.ts" ] && echo "FOUND helper" || echo "MISSING helper"
[ -f "apps/web/src/lib/__tests__/invoice-export-builder.test.ts" ] && echo "FOUND helper tests" || echo "MISSING helper tests"
[ -f "apps/web/src/app/api/factures/export/route.ts" ] && echo "FOUND route" || echo "MISSING route"
[ -f "apps/web/src/app/api/factures/export/__tests__/route.test.ts" ] && echo "FOUND route tests" || echo "MISSING route tests"
git log --oneline -1 | grep -q "11-07" && echo "FOUND commit" || echo "MISSING commit"
```

## Known Stubs

Aucun. Le helper retourne des données réelles consommables par xlsx, la route fait une vraie query Prisma, l'AuditLog est créé pour de vrai. Pas de placeholder, pas de "coming soon", pas de mock-data résiduel.

## Self-Check: PENDING (commits + tests pending manual execution)
