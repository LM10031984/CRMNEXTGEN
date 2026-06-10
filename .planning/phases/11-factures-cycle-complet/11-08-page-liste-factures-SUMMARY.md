---
phase: 11-factures-cycle-complet
plan: 08
subsystem: invoices
tags: [factures, invoices, ui, page-liste, prio-cards, filtres-chips, export, audit-log, backfill, rbac, fact-01]

requires:
  - phase: 11-02
    provides: logInvoiceEvent(...) helper AuditLog entity=Invoice / actions invoices.*
  - phase: 11-05
    provides: Avoirs Invoice avec status=CREDIT_NOTE + originalInvoiceId self-FK (cross-nav D-07)
  - phase: 11-06
    provides: lastReminderAt + reminderCount sur Invoice (affichés colonne "Relances")
  - phase: 11-07
    provides: Route API /api/factures/export?from=...&to=... (bouton Exporter D-15)
  - phase: 08
    provides: hasRole(user, allowed) helper pur (soft-redirect D-Phase9-Q)
  - phase: 09
    provides: Pattern Server Component leads/charge (PrioCardLocal + searchParams + force-dynamic)
provides:
  - Server action getInvoicesListData(filters, page, pageSize) → { kpis, rows, total }
  - 4 PrioCard métier (D-05) sur page /app/factures (CA mois / Impayés / DSO / À facturer)
  - Filtres chips combinés (D-06) : status multi / période / onlyUnpaid
  - Table flat avec badges statuts pastilles + badge AVO cross-nav (D-07/D-20)
  - Bouton "Exporter" DropdownMenu (D-15) RBAC ADMIN+COMPTABLE (D-17)
  - Empty states "Aucune facture pour cette période" / "Aucun impayé 🎉"
  - Backfill 3 actions Phase 7-02 émettent logInvoiceEvent (D-18) : invoices.created / invoices.issued / invoices.payment_recorded
affects: [11-09]

tech-stack:
  added: []
  patterns:
    - "Helper data fetching getInvoicesListData : 6 queries Prisma parallèles via Promise.all (4 KPI + rows + count) — pattern identique à lib/lead-load-stats.ts Phase 9 mais avec $queryRaw pour DSO Postgres-native"
    - "DSO moyen via $queryRaw EXTRACT(EPOCH FROM (paidAt - issueDate)) / 86400.0 : Prisma aggregate ne sait pas calculer AVG sur une différence de dates, raw SQL nécessaire. Math.round côté JS sur le résultat float Postgres"
    - "Composants Server pour l'affichage statique (PrioCards/Filters/Table) + Client pour interaction (ExportButton avec Radix DropdownMenu). Filters utilise des <Link> au lieu de useState : la navigation Next.js recharge le Server Component parent, état pur dans l'URL"
    - "Cast `href as never` sur Link dynamiques (pattern Phase 9 leads) — Next.js experimental typedRoutes refuse les strings construites runtime. Le cast localise la friction au point d'usage sans désactiver typedRoutes globalement"
    - "Backfill logInvoiceEvent hors transaction (cohérent createCreditNote Plan 11-05) : audit complémentaire qui ne doit pas bloquer rollback business. Si AuditLog échoue après une création réussie, c'est un événement à grogner ailleurs (Sentry futur) mais pas un retour { ok: false }"
    - "2 events par création (invoices.created + invoices.issued) : la création passe direct en ISSUED (pas de DRAFT step Phase 7-02), mais le double-event respecte la sémantique CGI 'émission' explicite + permet à un futur reporting Qualiopi de distinguer création vs émission si le flow évolue"
    - "Source-regex tests (D-Phase9-N) pour le backfill : les 3 actions ont une logique métier riche (PDF + MinIO + transactions multi-table) — un test runtime nécessiterait de mocker ~10 modules. La regex sur le code source vérifie que les calls logInvoiceEvent sont bien posés et anti-régresse leur retrait"
    - "Empty state contextuel : 'Aucun impayé 🎉' n'apparaît QUE si filtre onlyUnpaid actif ET rows.length === 0 — pattern UX positif récompense quand le travail est fait. L'empty state générique 'Aucune facture pour cette période' couvre les autres cas"
    - "EnrollmentStatus 'ATTENDED' au lieu de 'COMPLETED' : l'enum Prisma n'a pas COMPLETED (PRE_ENROLLED / CONFIRMED / ATTENDED / CANCELLED / NO_SHOW). ATTENDED est le statut sémantique 'formation terminée' utilisé partout (qualiopi-bilan-stats.ts, product-satisfaction-panel.tsx). Deviation Rule 3 documentée"

key-files:
  created:
    - apps/web/src/server/actions/invoices-list.ts
    - apps/web/src/components/invoices/invoices-prio-cards.tsx
    - apps/web/src/components/invoices/invoices-filters.tsx
    - apps/web/src/components/invoices/invoices-list-table.tsx
    - apps/web/src/components/invoices/invoices-export-button.tsx
    - apps/web/src/app/app/factures/__tests__/page.smoke.test.ts
    - apps/web/src/server/actions/__tests__/invoices-audit.test.ts
  modified:
    - apps/web/src/app/app/factures/page.tsx (REMPLACEMENT placeholder Phase pre-11 → page liste métier complète)
    - apps/web/src/server/actions/invoices.ts (backfill 3 actions : +72 lignes, signatures inchangées)
    - apps/web/src/server/actions/__tests__/invoices-list.test.ts (remplacement 10 it.todo Wave 0 → 13 vrais tests)

key-decisions:
  - "Helper pur server action getInvoicesListData (D-Phase9-K pattern Phase 9) : isolé de l'UI, testable sans Lucia/Next runtime, signature stable { kpis, rows, total }. La page Server Component fait juste validateRequest + parseSP + appel + composition"
  - "DSO calculé sur PAID du mois courant uniquement (pas tous PAID confondus) : Laurent veut une métrique court-terme actionable. Si la moyenne historique remonte à 2025, ça noie le signal. Sliding window = mois courant (RESEARCH §Calcul KPI)"
  - "Filtre onlyUnpaid override (pas cumul) avec statuses explicites : un utilisateur qui clique 'Voir impayés' veut UN état clair, pas un mix avec ses chips status précédents. L'URL ?onlyUnpaid=true seule est suffisante, les chips status sont ignorés tant que onlyUnpaid=true"
  - "'À facturer' = SessionParticipant.enrollmentStatus='ATTENDED' AND invoices=none : 'inscription terminée sans facture'. Ce KPI alerte Laurent sur le risque de trou de facturation post-formation. PRE_ENROLLED/CONFIRMED ne comptent pas (peut-être annulé), CANCELLED/NO_SHOW non plus (rien à facturer)"
  - "RBAC page liste = ADMIN/MANAGER/COMPTABLE/LECTEUR (pas FORMATEUR/COMMERCIAL) : la page liste de toutes les factures du tenant est sensible. FORMATEUR voit ses factures via les fiches sessions, COMMERCIAL via leads. Filtrer par scope rôle (D-19 'own only') sera une evolution future si le besoin remonte"
  - "Pattern PrioCardLocal local (pas import dashboard/prio-card) : Phase 9 leads/charge a établi ce pattern de mini-clone — le composant dashboard interne n'est pas exporté en helper public. Pas de DRY-violation : les 4 instances vivent dans 2 fichiers (lead-charge + invoices-prio-cards), refacto futur si une 3e apparaît"
  - "EXPORT_BUTTON DropdownMenu plutôt que bouton direct : Laurent veut 4 raccourcis fréquents (mois/trimestre/année) en 1 clic. Un bouton direct enverrait toujours sur le mois courant et obligerait à passer par 'Personnalisé' pour le reste. Les 4 chips couvrent 95% des cas opérationnels (les 5% restants : DateRange picker futur)"
  - "Backfill en append-only : NE PAS modifier la logique métier existante des 3 actions (createInvoiceFromParticipant / createInvoiceForSponsorGroup / recordInvoicePayment). Seul ajout = appels logInvoiceEvent post-transaction. Anti-régression Phase 7-02 préservée (signatures + tests Wave 0/1 inchangées)"

patterns-established:
  - "Page-liste-métier-pattern (Phase 11) : Server Component { validateRequest → hasRole soft-redirect → searchParams → helper data fetching → composition 4 sous-composants } reproductible pour futures pages liste (dossiers-opco déjà sur ce pattern, leads/charge aussi, factures complète la triade)"
  - "Backfill-audit-pattern : quand un nouveau helper logEvent est introduit (Phase 11-02), backfill les actions historiques en append-only AVEC source-regex tests (D-Phase9-N). Pattern réutilisable pour Phase 12+ si une 7e instance de helper-per-entity apparaît"

requirements-completed:
  - FACT-01

metrics:
  duration: "~50 min (4 commits Task 1 RED+GREEN + Task 2 + Task 3 + Task 4 RED + Task 4 GREEN — TDD strict)"
  completed: "2026-05-21"
  tests-added: 32  # 13 invoices-list + 9 page.smoke + 10 invoices-audit
  tests-passing: "569/569 (baseline 537 + 32 nouveaux)"
  typecheck: "clean (exit 0)"
  build: "✓ /app/factures route 1.58 kB, /api/factures/export 0 B, /app/factures/[id] 6.12 kB"
---

# Phase 11 Plan 08 : Page Liste Factures Summary

Page `/app/factures` REFONDUE depuis le placeholder Phase pre-11 vers une vraie page d'inventaire métier conforme à FACT-01 — 4 PrioCard KPI en haut (CA mois / Impayés / DSO / À facturer) + filtres chips combinés (status multi / période / "Voir impayés") + table flat avec badges statuts pastilles + badge AVO cross-nav + bouton Exporter DropdownMenu (RBAC ADMIN+COMPTABLE) — et 3 server actions Phase 7-02 backfilled pour émettre `logInvoiceEvent` (D-18 trace complète).

## What Was Built

### Task 1 — Helper `getInvoicesListData` (server action)

Server action exportée par `apps/web/src/server/actions/invoices-list.ts` (227 lignes). Retourne `{ kpis: InvoicesListKpis; rows: InvoiceRow[]; total: number }` via 6 queries Prisma parallèles dans un `Promise.all` :

| Query | Source | KPI calculé |
| --- | --- | --- |
| `invoice.aggregate({ status: REVENUE_STATUSES, issueDate dans mois })` | SUM amountTTC | `caMois` |
| `invoice.aggregate({ status: UNPAID_STATUSES })` | SUM(amountTTC) - SUM(amountPaid), COUNT | `impayesAmount`, `impayesCount` |
| `$queryRaw EXTRACT(EPOCH FROM paidAt-issueDate)/86400` | AVG jours sur PAID du mois | `dsoMoyen` (null si aucune) |
| `sessionParticipant.count({ enrollmentStatus: 'ATTENDED', invoices: { none: {} } })` | COUNT inscriptions terminées sans facture | `aFacturerCount` |
| `invoice.findMany({ where, include, orderBy, skip, take })` | Rows formatées avec relations | `rows` |
| `invoice.count({ where })` | Total pour pagination | `total` |

Filtres : `statuses` multi / `from`/`to` sur issueDate / `payerOrgId` / `onlyUnpaid` (override → ISSUED+PARTIAL+OVERDUE).
Tri : `[{ issueDate: 'desc' }, { number: 'desc' }]`.
Scope multi-tenant via `validateRequest()` (soft-return vide si non auth — la page redirect).

Tests : `invoices-list.test.ts` (13 tests) — 11 acceptance + 2 bonus (early-return non-auth + map row isAvoir/originalNumber/payerLabel fallback person).

### Task 2 — 4 composants UI invoices/

- **`invoices-prio-cards.tsx`** (Server) : 4 PrioCardLocal D-05 labels verbatim "CA facturé ce mois" / "Impayés" / "DSO moyen" / "À facturer". Icons lucide (TrendingUp emerald / AlertCircle red / Clock sky / FileText amber). `Intl.NumberFormat('fr-FR', currency: 'EUR', maximumFractionDigits: 0)`.

- **`invoices-filters.tsx`** (Server) : 3 sections — Statut (7 chips DRAFT/ISSUED/PAID/PARTIAL/OVERDUE/CANCELLED/CREDIT_NOTE) + Période (4 chips this-month/last-month/quarter/year) + Toggle "Voir seulement impayés" + compteur total + bouton Réinitialiser. Tous les liens sont des `<Link>` qui mettent à jour searchParams — pas de useState (pattern Phase 9.1).

- **`invoices-list-table.tsx`** (Server) : Table HTML plate (`overflow-x-auto -mx-4 sm:mx-0` pattern Phase 3 responsive) avec 7 colonnes (Numéro / Date / Payeur / Montant TTC / Reste / Statut / Relances). Pastilles couleur statuts (D-20) via `STATUS_PALETTE`. Badge "AVO" + lien `← {originalNumber}` sur lignes CREDIT_NOTE (cross-nav D-07). Colonne Relances : `N{count}` + tooltip date dernière relance (consomme `lastReminderAt` + `reminderCount` Plan 11-06). Empty state "Aucune facture pour cette période".

- **`invoices-export-button.tsx`** (Client `'use client'`) : Radix DropdownMenu avec 4 raccourcis (Ce mois / Mois dernier / Trimestre courant / Année courante) → `<a href="/api/factures/export?from=...&to=...">` direct download (route Plan 11-07). RBAC D-17 : `if (!['ADMIN', 'COMPTABLE'].includes(currentRole)) return null` — le bouton n'est PAS rendu pour les autres rôles.

`tsc --noEmit` clean. Cast `href as never` sur 3 `<Link>` dynamiques (pattern Phase 9 leads — typedRoutes strict).

### Task 3 — Page `/app/factures` Server Component

`apps/web/src/app/app/factures/page.tsx` REMPLACE intégralement le placeholder Phase pre-11. Flow :

1. `validateRequest()` → redirect `/login` si non auth
2. `hasRole(user, ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR'])` → redirect `/app` sinon (D-Phase9-Q)
3. `parseFiltersFromSearchParams(sp)` : convertit `?period=this-month` en `from/to` (4 cases : this-month / last-month / quarter / year), parse `?status=X` (string ou string[]) en array, `?onlyUnpaid=true` → boolean
4. `getInvoicesListData({ filters, page, pageSize: 50 })` → `{ kpis, rows, total }`
5. Composition : `<header>` (titre + InvoicesExportButton à droite) + `<InvoicesPrioCards>` + `<InvoicesFilters>` + `<InvoicesListTable>` + empty state contextuel "Aucun impayé 🎉" si `onlyUnpaid && rows.length === 0`

`export const dynamic = 'force-dynamic'` : KPI temps réel + searchParams toujours frais.

Tests : `__tests__/page.smoke.test.ts` (9 tests source-regex D-Phase9-N) — anti-régression sur placeholder Phase pre-11 (verifies `not.toMatch(/<Placeholder/)`) + import composants + guards + `force-dynamic` + parser 4 périodes + empty state.

### Task 4 — Backfill `logInvoiceEvent` dans 3 actions existantes (FACT-01 D-18)

`apps/web/src/server/actions/invoices.ts` (+72 lignes, signatures `{ ok, invoiceId, documentId, number, error }` inchangées) :

- `createInvoiceFromParticipant` → émet 2 events :
  - `invoices.created` avec diff `{ amountHt, amountTtc, vatRate, participantId, payerOrgId, sessionId, number }`
  - `invoices.issued` avec diff `{ status: { before: 'DRAFT', after: 'ISSUED' } }`
- `createInvoiceForSponsorGroup` → idem (mais `participantIds[]` + `grouped: true`)
- `recordInvoicePayment` → émet `invoices.payment_recorded` avec diff `{ amount, method, receivedAt, reference, fullyPaid, newStatus, balanceRemaining }`

Tests : `invoices-audit.test.ts` (10 tests) — 5 source-regex backfill (createInvoice×2 émettent created+issued / recordInvoicePayment émet payment_recorded avec diff complet) + 4 anti-régression (signatures retour inchangées + import logInvoiceEvent depuis @/lib/invoice-audit) + 1 runtime helper (logInvoiceEvent crée AuditLog entity=Invoice).

## Tests Summary

| Fichier | Tests | Status |
| --- | --- | --- |
| `server/actions/__tests__/invoices-list.test.ts` | 13 | ✅ |
| `app/app/factures/__tests__/page.smoke.test.ts` | 9 | ✅ |
| `server/actions/__tests__/invoices-audit.test.ts` | 10 | ✅ |
| **Total nouveaux tests** | **32** | **✅** |
| Suite apps/web complète | 569 (baseline 537 + 32) | ✅ |

`pnpm --filter @qualiof/web typecheck` (alias `tsc --noEmit`) : exit 0.
`pnpm --filter @qualiof/web build` : routes `/app/factures` (1.58 kB) + `/api/factures/export` (0 B) + `/app/factures/[id]` (6.12 kB) compilées sans warning.

## Deviations from Plan

### Rule 3 — Blocking issue (auto-fixed)

**1. EnrollmentStatus.COMPLETED n'existe pas dans le schema Prisma**

- **Found during:** Task 1 RED/GREEN
- **Issue:** Le PLAN mentionne `enrollmentStatus='COMPLETED'` pour le KPI "À facturer", mais l'enum réel = `PRE_ENROLLED / CONFIRMED / ATTENDED / CANCELLED / NO_SHOW`.
- **Fix:** Utilisation de `'ATTENDED'` (équivalent sémantique 'formation terminée' utilisé partout dans le code existant — voir `lib/qualiopi-bilan-stats.ts:150-153` et `components/produits/product-satisfaction-panel.tsx:46`).
- **Files modified:** `apps/web/src/server/actions/invoices-list.ts` + `__tests__/invoices-list.test.ts` (Test 5 + docstring)
- **Commit:** `317ad40` (Task 1 GREEN)

### Notes complémentaires (pas des déviations)

- **"Personnalisé" (DateInput from/to) défère** : le CONTEXT.md D-06 mentionne 5e option chip "Personnalisé" avec 2 DateInput. Cette livraison expose les 4 chips prédéfinis (this-month / last-month / quarter / year). Si Laurent demande la fenêtre custom, c'est une evolution future (pas un blocker FACT-01).
- **Pagination UI absente** : le helper retourne `total` mais la page ne rend pas encore de bandeau "Page 1 / N" avec liens prev/next. 50 lignes par page suffisent au volumes actuels Start Academy (~quelques dizaines de factures/mois). Pagination UI = evolution si volume > 200/page.
- **Filtre "Payeur" (recherche organisation) absent** : CONTEXT D-06 mentionne `payerOrgId` filter. Le helper le supporte (paramètre exposé), mais la page n'a pas encore d'UI de recherche organisation. La query `?payerOrgId=X` fonctionne déjà programmatiquement (cross-nav depuis fiche organisation futur). UI = evolution.

## Authentication Gates

Aucune — exécution autonome complète.

## Self-Check: PASSED

**Files created (verified via `[ -f path ]`):**
- `apps/web/src/server/actions/invoices-list.ts` ✅
- `apps/web/src/components/invoices/invoices-prio-cards.tsx` ✅
- `apps/web/src/components/invoices/invoices-filters.tsx` ✅
- `apps/web/src/components/invoices/invoices-list-table.tsx` ✅
- `apps/web/src/components/invoices/invoices-export-button.tsx` ✅
- `apps/web/src/app/app/factures/__tests__/page.smoke.test.ts` ✅
- `apps/web/src/server/actions/__tests__/invoices-audit.test.ts` ✅

**Files modified (verified via `git log` + `git diff`):**
- `apps/web/src/app/app/factures/page.tsx` (placeholder → page complète) ✅
- `apps/web/src/server/actions/invoices.ts` (+72 lignes backfill) ✅
- `apps/web/src/server/actions/__tests__/invoices-list.test.ts` (Wave 0 stub → 13 tests réels) ✅

**Commits (verified via `git log --oneline | grep 11-08`):**
- `9b787e6` test(11-08): add failing tests for getInvoicesListData ✅
- `317ad40` feat(11-08): implement getInvoicesListData helper ✅
- `8e423b6` feat(11-08): 4 composants UI factures ✅
- `27e8388` feat(11-08): page /app/factures Server Component refondue ✅
- `8945d6c` test(11-08): add failing tests for backfill logInvoiceEvent ✅
- `321a89b` feat(11-08): backfill logInvoiceEvent dans 3 actions existantes ✅
