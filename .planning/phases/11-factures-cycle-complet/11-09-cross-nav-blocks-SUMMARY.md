---
phase: 11-factures-cycle-complet
plan: 09
subsystem: ui
tags: [react-server-components, prisma, cross-navigation, airtable-style, invoices]

# Dependency graph
requires:
  - phase: 09.1-centralisation-qualiopi-360
    provides: "D-05 cross-nav Airtable-style pattern (fiche apprenant timeline / fiche session matrice docs) — pattern à reproduire pour les factures"
  - phase: 11-factures-cycle-complet
    provides: "Plan 11-08 invoices-list-table.tsx STATUS_PALETTE D-20 (palette pastilles statuts à dupliquer en local pour compactage)"
provides:
  - "LearnerInvoicesBlock Server Component (5 cols, badge AVO, cross-nav 1-clic)"
  - "SessionInvoicesBlock Server Component (5 cols, double OR sessionId|participant.sessionId)"
  - "Bloc Factures intégré dans /app/apprenants/[id] entre Timeline et Tabs"
  - "Bloc Factures intégré dans /app/sessions/[id] après ParticipantDocMatrix"
  - "Critère Airtable D-07 atteint : 1-2 clics depuis fiche apprenant/session → fiche facture"
affects: [phase-12, phase-13, fact-01, fact-02, fact-03, future-cross-nav-blocks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component compact RSC async avec query Prisma scope tenantId + relation filter"
    - "Cross-nav Airtable-style D-07 (Phase 9.1 D-05 reproduit) : bloc table 4-5 col en section sobre, click ligne → fiche détail"
    - "Avoirs distincts visuellement : badge violet 'AVO' inline + lien `← {originalNumber}` vers facture originale"
    - "Defense-in-depth tenantId même quand relation déjà filtrée (cohérence convention Phase 8 RBAC)"

key-files:
  created:
    - "apps/web/src/components/learners/learner-invoices-block.tsx"
    - "apps/web/src/components/learners/__tests__/learner-invoices-block.test.ts"
    - "apps/web/src/components/sessions/session-invoices-block.tsx"
    - "apps/web/src/components/sessions/__tests__/session-invoices-block.test.ts"
  modified:
    - "apps/web/src/app/app/apprenants/[id]/page.tsx (import + intégration entre LearnerTimeline et LearnerTabs)"
    - "apps/web/src/app/app/sessions/[id]/page.tsx (import + intégration après ParticipantDocMatrix)"

key-decisions:
  - "D-11-09-A : nouveau dossier learners/ créé (PLAN frontmatter explicite — apprenants/ existant n'est PAS le bon emplacement, learners/ matche le naming canonique anglais des composants Phase 8+)"
  - "D-11-09-B : STATUS_PALETTE et STATUS_LABELS dupliqués en local dans chaque bloc (Task 1 + Task 2) plutôt que factorisés — composants compacts, duplication acceptée explicitement par le plan ('duplication acceptée car composant compact')"
  - "D-11-09-C : pas de filtre OR sur sessionIds[] côté LearnerInvoicesBlock (apprenant) — le filtre `participant: { personId }` couvre les factures par apprenant ; les factures groupées par sponsor (sessionId direct sans participantId) ne remontent PAS dans la fiche apprenant (cohérent avec leur sémantique 'facture sponsor'). Choix simplificateur conforme au PLAN."
  - "D-11-09-D : SessionInvoicesBlock utilise OR [sessionId, participant.sessionId] pour couvrir les 2 cas : facture groupée par sponsor (Invoice.sessionId direct) ET facture par participant individuel (Invoice.participant.sessionId)"
  - "D-11-09-E : empty state verbatim 'Aucune facture liée à cet apprenant' / 'Aucune facture liée à cette session' (test grep direct sur la chaîne — anti-régression sur copy)"

patterns-established:
  - "Cross-nav block pattern (à dupliquer pour futurs blocs cross-entité) : Server Component, query Prisma scope tenant + relation, table compacte 5 cols, empty state border-dashed, click row → fiche détail"
  - "Avoirs visualisation row : badge inline violet 'AVO' à droite du numéro + lien `← {originalNumber}` vers facture originale en regroupement visuel"
  - "Defense-in-depth tenantId : même quand la relation est déjà filtrée (participant.personId par exemple), on ajoute tenantId dans le where pour cohérence avec convention Phase 8"

requirements-completed: [FACT-01]

# Metrics
duration: 9min
completed: 2026-05-21
---

# Phase 11 Plan 09 : Cross-nav blocks fiche apprenant + session Summary

**Bloc Factures Server Component ajouté sur fiche apprenant et fiche session avec badge AVO + lien vers facture originale, finalisant le critère Airtable D-07 (1-2 clics vers fiche facture depuis n'importe quelle entité)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-21T10:02:11Z
- **Completed:** 2026-05-21T10:11:59Z
- **Tasks:** 2
- **Files modified:** 6 (4 créés + 2 pages modifiées)

## Accomplishments
- `LearnerInvoicesBlock` Server Component : table compacte 5 colonnes (Numéro / Date / TTC / Reste / Statut) listant les factures où `participant.personId === current`, scope tenant
- `SessionInvoicesBlock` Server Component : table compacte 5 colonnes (Numéro / Bénéficiaire-Payeur / Date / TTC / Statut) listant les factures via double OR `[sessionId, participant.sessionId]`, scope tenant
- Avoirs distincts : badge violet `AVO` inline + lien `← {originalNumber}` vers facture originale (pattern visuel D-07)
- Cross-nav 1-clic : ligne facture → `/app/factures/[id]` sur le numéro (font-mono + hover underline)
- Anti-régression Phase 9.1 préservée : `LearnerAlertsBanner`, `LearnerPrioCards`, `LearnerTimeline`, `LearnerTabs` toujours dans `/app/apprenants/[id]` ; `SessionOnlyDocsBlock`, `ParticipantDocMatrix`, Inscrits toujours dans `/app/sessions/[id]`
- 585/585 tests web verts (= 569 base post Plan 11-08 + 16 nouveaux tests source-regex)
- Critère Airtable D-07 atteint : "Auditeur trouve une facture en 1-2 clics depuis fiche apprenant/session"

## Task Commits

Each task was committed atomically (TDD RED → GREEN) :

1. **Task 1 RED — test failing LearnerInvoicesBlock** — `d7cdc73` (test)
2. **Task 1 GREEN — LearnerInvoicesBlock + intégration fiche apprenant** — `d7669ee` (feat)
3. **Task 2 RED — test failing SessionInvoicesBlock** — `dc89fdc` (test)
4. **Task 2 GREEN — SessionInvoicesBlock + intégration fiche session** — `a763af9` (feat)

**Plan metadata:** à venir (SUMMARY + STATE + ROADMAP commit).

## Files Created/Modified
- `apps/web/src/components/learners/learner-invoices-block.tsx` — Server Component RSC compact, query Prisma scope tenantId + participant.personId, table 5 cols + badge AVO + lien facture originale (208 lignes)
- `apps/web/src/components/learners/__tests__/learner-invoices-block.test.ts` — 8 tests source-regex (Server Component, tenant, filter, empty state, cross-nav, AVO, export)
- `apps/web/src/components/sessions/session-invoices-block.tsx` — Server Component RSC compact, double OR `[sessionId, participant.sessionId]`, table 5 cols avec colonne Bénéficiaire/Payeur (219 lignes)
- `apps/web/src/components/sessions/__tests__/session-invoices-block.test.ts` — 8 tests source-regex (Server Component, tenant, double OR, empty state, cross-nav, AVO+originalInvoice, export)
- `apps/web/src/app/app/apprenants/[id]/page.tsx` — import `LearnerInvoicesBlock` + JSX entre `<LearnerTimeline>` et `<LearnerTabs>` (anti-régression CENTRAL-03)
- `apps/web/src/app/app/sessions/[id]/page.tsx` — import `SessionInvoicesBlock` + JSX après `<ParticipantDocMatrix>` (anti-régression CENTRAL-01/02)

## Decisions Made

Voir frontmatter `key-decisions` (D-11-09-A..E). Trois choix sortent :

- **D-11-09-A — Dossier `learners/`** : le plan exigeait explicitement `apps/web/src/components/learners/learner-invoices-block.tsx`. Le projet a déjà un dossier `apprenants/` (français) pour les composants liés à `Person`. On crée un nouveau dossier `learners/` (anglais) pour matcher le naming canonique des composants récents (Phase 9 `leads/`, Phase 8 `users/`). Cohérent avec la convention CONVENTIONS.md "Files: kebab-case" sans contrainte sur la langue du dossier.
- **D-11-09-C — Pas d'OR sessionIds[] sur LearnerInvoicesBlock** : le PLAN spec Task 1 dit `participant: { personId }` seul. Les factures groupées par sponsor (Invoice.sessionId direct sans participantId) ne remontent pas dans la fiche apprenant — c'est cohérent avec leur sémantique de "facture sponsor groupée". Anti-déviation : on suit le plan plutôt que d'élargir le filtre.
- **D-11-09-D — Double OR sur SessionInvoicesBlock** : conforme au PLAN (Task 2 behavior Test 2). Couvre factures par sponsor (sessionId direct) ET par participant (via relation).

## Deviations from Plan

None - plan executed exactly as written.

Tous les acceptance criteria du PLAN ont été remplis sans déviation :
- Fichiers créés aux chemins exigés (incluant nouveau dossier `learners/`)
- Pas de `'use client'` directive (Server Components confirmés par grep négatif)
- Where clauses Prisma matchent exactement les patterns du PLAN
- Empty states verbatim
- Cross-nav Link `/app/factures/${inv.id}` présent
- Badge AVO conditional sur status CREDIT_NOTE avec lien vers facture originale
- Anti-régression Phase 9.1 vérifiée (5 blocs `LearnerTimeline/LearnerPrioCards/LearnerAlertsBanner/SessionOnlyDocsBlock/ParticipantDocMatrix` toujours présents)
- 8/8 + 8/8 tests verts
- Build Next.js OK (routes `/app/apprenants/[id]` 7.56 kB et `/app/sessions/[id]` 17.5 kB compilent)

## Issues Encountered
None.

Le typecheck (commande `pnpm typecheck` absente du `apps/web/package.json` — `tsc --noEmit` direct lancé à la place) passe à exit 0 sans warning.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Phase 11 complétée à 10/10 plans** (Wave 4 dernier plan livré). Critères de succès Phase 11 atteints :

| Critère ROADMAP Phase 11 | Statut |
|---|---|
| FACT-01 Page liste factures `/app/factures` enrichie (4 PrioCard + filtres + cross-nav) | Livré (Plans 11-07/11-08 + 11-09) |
| FACT-02 Avoirs (NCN) numérotés + create + partiel/total | Livré (Plans 11-01/11-04/11-05) |
| FACT-03 Relances hybrides cron + bouton manuel (J+30 amical / J+45 ferme) | Livré (Plans 11-03/11-04/11-06) |
| FACT-04 Export comptable xlsx générique 12 colonnes (ADMIN+COMPTABLE) | Livré (Plan 11-07) |

**Critère Airtable D-07** : "Auditeur trouve une facture en 1-2 clics depuis fiche apprenant/session" — atteint via les 2 nouveaux blocs.

**État global tests** :
- `apps/web` : 585/585 verts
- Anti-régression Phase 9.1 : 5/5 blocs `LearnerAlertsBanner / LearnerPrioCards / LearnerTimeline / SessionOnlyDocsBlock / ParticipantDocMatrix` confirmés présents dans les 2 pages.

**Validation manuelle restante (11-VALIDATION.md)** :
- `pnpm dev:full` → ouvrir une fiche apprenant existante (ex : `LASCAR Quentin` mentioné dans STATE.md historique) → vérifier visuellement le bloc "Factures" avec rows + click → fiche facture
- Idem fiche session
- Vérifier render badge AVO quand un avoir existe

**Prochaine étape** : `/gsd:transition` pour clôturer la Phase 11 et lancer la planification Phase 12 (probable : Audit Qualiopi blanc QBLANC-01..03).

## Self-Check: PASSED

Files verified (7/7) :
- apps/web/src/components/learners/learner-invoices-block.tsx
- apps/web/src/components/learners/__tests__/learner-invoices-block.test.ts
- apps/web/src/components/sessions/session-invoices-block.tsx
- apps/web/src/components/sessions/__tests__/session-invoices-block.test.ts
- apps/web/src/app/app/apprenants/[id]/page.tsx
- apps/web/src/app/app/sessions/[id]/page.tsx
- .planning/phases/11-factures-cycle-complet/11-09-cross-nav-blocks-SUMMARY.md

Commits verified (4/4) : d7cdc73, d7669ee, dc89fdc, a763af9.

---
*Phase: 11-factures-cycle-complet*
*Completed: 2026-05-21*
