---
phase: 07-param-tres-organisme-ditables
plan: 01
subsystem: database
tags: [prisma, tenant, of-config, bdd-fallback-env, server-actions, multi-tenant]

# Dependency graph
requires:
  - phase: 00-foundation
    provides: "Tenant model, validateRequest pattern, prisma singleton"
provides:
  - "Tenant Prisma model étendu avec 10 nouvelles colonnes éditables (D-01 hybrid BDD/ENV)"
  - "of-config.ts async loadOfConfig(tenantId) + helper pur resolveOfConfig + getOfConfig() legacy"
  - "12+ call sites migrés vers pre-resolve pattern (Option B)"
  - "Drift invoices.ts + programme-generator.ts éliminé (const OF locaux supprimés)"
  - "Drift qualiopi-bilan/export + generate-checklist-formation éliminé"
  - "Mailer.ts passe par of-config (préparation Plan 07-02 emailFrom éditable)"
  - "OfConfig étendu : emailFrom, legalForm, legalMentions, rcs, invoicePrefix, logoPath, signaturePedagoPath, signatureDirigeantPath, handicapReferent"
  - "Migration SQL 20260514163617_phase_07_tenant_settings appliquée"
  - "apps/web/public/of-assets/ git-ignored + .gitkeep pour matérialiser dossier"
affects: [07-02, 07-03, 07-04, 07-05, 11-factures]

# Tech tracking
tech-stack:
  added: []  # Pas de nouvelle dépendance — utilise Prisma existant + vitest existant
  patterns:
    - "Pre-resolve OF config (Option B) : Server Action fait await loadOfConfig(user.tenantId), passe of: OfConfig aux templates en paramètre data ou ctx.of"
    - "Helper pur resolveOfConfig(tenant | null) testable sans Prisma — stratégie pick(bdd, envKey, fallback)"
    - "Footers PDF sans contexte tenantId → restent getOfConfig() sync legacy (résout en fallback ENV)"
    - "Hybrid BDD/ENV per-champ (D-01) : null/whitespace BDD → fallback process.env, sinon BDD prime"

key-files:
  created:
    - "apps/web/src/lib/__tests__/of-config.test.ts (15 tests Vitest, couverture stratégie hybride)"
    - "packages/db/prisma/migrations/20260514163617_phase_07_tenant_settings/migration.sql"
    - "apps/web/.gitignore (public/of-assets/)"
    - "apps/web/public/.gitkeep"
  modified:
    - "packages/db/prisma/schema.prisma (model Tenant +10 colonnes nullables + updatedAt)"
    - "apps/web/src/lib/of-config.ts (refactor complet : async loadOfConfig + resolveOfConfig pur + getOfConfig legacy)"
    - "apps/web/src/server/actions/invoices.ts (drift fix : suppression bloc OF local)"
    - "apps/web/src/server/actions/programme-generator.ts (drift fix : suppression OF_DEFAULTS local)"
    - "apps/web/src/server/actions/agefice-generator.ts (loadOfConfig + user.tenantId)"
    - "apps/web/src/server/actions/convention-generator.ts (loadOfConfig + passe of à template)"
    - "apps/web/src/server/actions/dossier-reminder.ts (loadOfConfig)"
    - "apps/web/src/server/actions/preinscription-reminders.ts (loadOfConfig + passe of à template)"
    - "apps/web/src/server/actions/generate-checklist-formation.ts (drift fix : OF_HANDICAP_REFERENT via of-config)"
    - "apps/web/src/app/api/qualiopi-bilan/export/route.ts (drift fix : 5 ENV vars OF_* via of-config)"
    - "apps/web/src/app/api/cron/preinscription-reminders/route.ts (loadOfConfig cache multi-tenant)"
    - "apps/web/src/lib/preinscription-reminder-template.ts (reçoit of: OfConfig en param)"
    - "apps/web/src/lib/convention-template.ts (reçoit of: OfConfig en param)"
    - "apps/web/src/lib/programme-template.ts (reçoit of: OfConfig en param)"
    - "apps/web/src/lib/closure/certificat-template.ts (utilise ctx.of ?? getOfConfig)"
    - "apps/web/src/lib/closure/attestation-template.ts (utilise ctx.of ?? getOfConfig)"
    - "apps/web/src/lib/closure/shared-template.ts (renderBrandHeader/renderCorpFooter/wrapHtml : of? optionnel rétrocompat + ClosureContext.of?)"
    - "apps/web/src/lib/closure/worker.ts (pre-resolve of via loadOfConfig(payload.tenantId), propagation ctx.of)"
    - "apps/web/src/lib/mailer.ts (getFromAddress passe par getOfConfig au lieu de process.env direct)"

key-decisions:
  - "Migration Prisma : updatedAt avec @default(now()) @updatedAt — Prisma refuse @updatedAt seul sur ALTER TABLE si rows existent sans valeur"
  - "OfConfig étendu avec emailFrom + handicapReferent (Qualiopi-26) : centralise les ENV OF_* qui n'étaient pas dans getOfConfig"
  - "shared-template.ts renderBrandHeader/renderCorpFooter : of? optionnel (rétrocompat) plutôt que cascade refactor sur 14 closure templates non requis par le plan"
  - "Footer PDFs (of-paged-footer.ts, of-pdf-footer.ts) gardent getOfConfig() : pas de tenantId au call site, retour ENV fallback acceptable"
  - "wrapHtml + ClosureContext étendus avec of? : permet propagation BDD-first quand worker pre-resolve, fallback ENV sinon"
  - "Mailer.ts utilise getOfConfig() (legacy sync) : pas de tenantId disponible au call site SMTP. Plan 07-02 pourra évoluer vers loadOfConfig(tenantId) avec from explicite passé par chaque sendMail()"
  - "legalForm: String? libre (pas enum LegalForm) — conformité CONTEXT.md D-02 ; enum réutilisable retenue pour discussion Plan 07-02 si Laurent valide"

patterns-established:
  - "Pre-resolve Option B : Server Action fait await loadOfConfig(user.tenantId), passe of aux templates via data param ou ctx.of"
  - "Helper pick(bdd, envKey, fallback) : trim BDD → si non-vide retourne, sinon trim ENV → si non-vide retourne, sinon fallback default"
  - "Cron multi-tenant : Map<tenantId, OfConfig> cache local par boucle pour éviter N requêtes Prisma"
  - "Templates de closure : ctx.of ?? getOfConfig() pour rétrocompat tout en activant BDD-first quand worker propage"

requirements-completed: [SET-01, SET-02, SET-03]

# Metrics
duration: ~30min
completed: 2026-05-14
---

# Phase 7 Plan 01: Schema Tenant + of-config async Summary

**Tenant Prisma étendu de 10 colonnes éditables (hybrid BDD/ENV via D-01), of-config.ts refactoré en async loadOfConfig(tenantId) avec helper pur testable, 12+ call sites migrés et 4 drifts process.env.OF_* éliminés.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-14T16:33:00Z (approx)
- **Completed:** 2026-05-14T16:51:00Z
- **Tasks:** 3
- **Files modified:** 18 (4 nouveaux + 14 modifiés)

## Accomplishments

- **Bloquant Phase 7 levé** : Tenant model étendu permet désormais l'édition UI des paramètres OF (SET-01/02/03).
- **Drift critique éliminé** : `invoices.ts` et `programme-generator.ts` ne re-lisent plus `process.env.OF_*` localement — toute édition IBAN/BIC/SIRET future via Paramètres prendra effet immédiatement sur factures + programmes.
- **Stratégie hybride implémentée** : 15 tests Vitest couvrent `resolveOfConfig` (helper pur) avec BDD primary, ENV fallback, trim whitespace, address Json (postalCode/city + cp/ville), invoicePrefix défaut "FAC".
- **Zéro régression typings/build** : `tsc --noEmit` + `next build` passent clean.
- **Regression check strict respecté** : `grep -rn "process\.env\.OF_" apps/web/src/ | grep -v of-config` retourne 0 ligne.

## Task Commits

Chaque task commité atomiquement :

1. **Task 1: Étendre Tenant model + migration Prisma** — `a7d3572` (feat)
   - Schema Prisma : +10 colonnes (legalForm, legalMentions, invoicePrefix, iban, bic, emailFrom, logoPath, signaturePedagoPath, signatureDirigeantPath, updatedAt)
   - Migration SQL appliquée : `20260514163617_phase_07_tenant_settings`
   - apps/web/.gitignore (public/of-assets/) + apps/web/public/.gitkeep

2. **Task 2: Refactor of-config.ts en async + tests** — `851d1c7` (feat)
   - `loadOfConfig(tenantId): Promise<OfConfig>` async — lit Tenant + applique resolveOfConfig
   - `getOfConfig(): OfConfig` legacy sync — équivalent resolveOfConfig(null)
   - `resolveOfConfig(t | null): OfConfig` helper pur testable, exporté
   - 15 tests Vitest verts (couverture hybride BDD/ENV, trim, address Json variantes)

3. **Task 3: Migrer 12+ call sites + fix drifts** — `1968c02` (feat)
   - Server actions migrées : invoices, agefice-generator, convention-generator, dossier-reminder, preinscription-reminders, generate-checklist-formation, programme-generator, qualiopi-bilan/export, cron route
   - Templates migrés : convention-template, programme-template, preinscription-reminder-template (reçoivent `of: OfConfig`)
   - Closure templates : certificat-template, attestation-template (utilisent `ctx.of ?? getOfConfig`), shared-template renderBrandHeader/renderCorpFooter/wrapHtml (of? optionnel rétrocompat), ClosureContext.of? optionnel, worker.ts pre-resolve via loadOfConfig(payload.tenantId)
   - Mailer.ts getFromAddress() passe par getOfConfig (legacy ENV) au lieu de process.env direct

## Files Created/Modified

### Nouveaux fichiers
- `apps/web/src/lib/__tests__/of-config.test.ts` — 15 tests Vitest couvrant BDD/ENV hybrid
- `packages/db/prisma/migrations/20260514163617_phase_07_tenant_settings/migration.sql` — ALTER TABLE Tenant +10 colonnes
- `apps/web/.gitignore` — exclut public/of-assets/ runtime
- `apps/web/public/.gitkeep` — matérialise dossier public/

### Fichiers modifiés (Task 3 chain)
- `packages/db/prisma/schema.prisma` — model Tenant étendu
- `apps/web/src/lib/of-config.ts` — refactor complet (async + helper pur + legacy sync)
- `apps/web/src/server/actions/invoices.ts` — DRIFT FIX suppression bloc OF local
- `apps/web/src/server/actions/programme-generator.ts` — DRIFT FIX suppression OF_DEFAULTS local
- `apps/web/src/server/actions/agefice-generator.ts` + `convention-generator.ts` + `dossier-reminder.ts` + `preinscription-reminders.ts` + `generate-checklist-formation.ts` — loadOfConfig + user.tenantId
- `apps/web/src/app/api/qualiopi-bilan/export/route.ts` — DRIFT FIX 5 ENV vars OF_* via of-config
- `apps/web/src/app/api/cron/preinscription-reminders/route.ts` — cache Map<tenantId, OfConfig>
- `apps/web/src/lib/preinscription-reminder-template.ts` + `convention-template.ts` + `programme-template.ts` — reçoivent of via param
- `apps/web/src/lib/closure/certificat-template.ts` + `attestation-template.ts` — utilisent ctx.of
- `apps/web/src/lib/closure/shared-template.ts` — renderBrandHeader/renderCorpFooter/wrapHtml of? optionnel, ClosureContext.of? étendu
- `apps/web/src/lib/closure/worker.ts` — pre-resolve via loadOfConfig(payload.tenantId), propage ctx.of
- `apps/web/src/lib/mailer.ts` — getOfConfig au lieu de process.env.OF_*

## Decisions Made

Voir frontmatter `key-decisions` ci-dessus. Les 3 décisions principales :

1. **Schema Prisma** : `updatedAt @default(now()) @updatedAt` (et non `@updatedAt` seul) — sinon migration échoue sur rows existants.
2. **shared-template helpers optionnels** : `of?: OfConfig` plutôt que cascade refactor sur 14 closure templates hors scope plan — préserve grep regression check tout en activant BDD-first pour certificat/attestation.
3. **Mailer.ts** : passe par `getOfConfig()` legacy (ENV-only). Pas de tenantId disponible au call site. Plan 07-02 pourra évoluer vers `loadOfConfig(tenantId)` avec `from` explicite si Laurent demande emailFrom dynamique en multi-tenant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 2 - Missing Critical] DRIFTS additionnels découverts**

Le plan listait 12 call sites de `getOfConfig()` + 1 drift `invoices.ts`. **L'inventaire complet via `grep -rn "process\.env\.OF_"`** a révélé 3 drifts supplémentaires non listés au plan :

- **`apps/web/src/server/actions/programme-generator.ts:11-18`** : `const OF_DEFAULTS = { siret: process.env.OF_SIRET ?? ..., ... }` bypass identique à `invoices.ts`. Sans fix : l'édition UI SIRET/Adresse/RNQ n'affecterait pas les PDF programmes.
- **`apps/web/src/app/api/qualiopi-bilan/export/route.ts:81-84`** : 5 `process.env.OF_*` directs dans le footer Excel. Sans fix : export Qualiopi continuerait d'utiliser ENV même après édition Paramètres.
- **`apps/web/src/server/actions/generate-checklist-formation.ts:129`** : `process.env.OF_HANDICAP_REFERENT` direct. Sans fix : grep regression check échouerait (process.env.OF_ leak).
- **`apps/web/src/lib/mailer.ts:41-42`** : `process.env.OF_NAME` + `process.env.OF_EMAIL` dans `getFromAddress()`. Sans fix : grep regression check échouerait.

**Fix** : migration de tous ces sites vers `loadOfConfig(user.tenantId)` (server actions/routes avec tenant context) ou `getOfConfig()` legacy (mailer.ts singleton). Ajout du champ `handicapReferent` à `OfConfig` (Qualiopi-26 référent handicap).

- **Found during:** Task 3 (regression grep `process.env.OF_`)
- **Verification:** `grep -rn "process\.env\.OF_" apps/web/src/ | grep -v "of-config"` → 0 hit
- **Files modified:** programme-generator.ts, qualiopi-bilan/export/route.ts, generate-checklist-formation.ts, mailer.ts, of-config.ts (ajout `handicapReferent`)
- **Committed in:** `1968c02` (Task 3 commit)

**2. [Rule 3 - Blocking] OfConfig étendu avec champs nouveaux**

Le plan demandait que `loadOfConfig(tenantId)` retourne `OfConfig`. Pour utiliser le `emailFrom` (D-08) + `legalForm` + `legalMentions` + autres champs ajoutés à `Tenant` au Plan 07-02/03/04, j'ai préemptivement ajouté ces champs à `OfConfig` (string vide si BDD null & ENV absent). Ne nécessite aucune ENV à ajouter — `pick(t?.X, 'OF_X', '')` retourne '' si aucune source.

- **Found during:** Task 2 (refactor of-config.ts)
- **Fix:** Ajout de `emailFrom`, `legalForm`, `legalMentions`, `rcs`, `invoicePrefix`, `logoPath`, `signaturePedagoPath`, `signatureDirigeantPath`, `handicapReferent` à l'interface OfConfig
- **Verification:** Tests Vitest #9 + #10 couvrent ces champs (fallback ENV manquant = '' + BDD prime)
- **Committed in:** `851d1c7` (Task 2 commit)

**3. [Rule 3 - Blocking] Closure worker propagation `ctx.of`**

Le plan demandait que `certificat-template.ts` et `attestation-template.ts` reçoivent `of` en param. Sans propagation depuis le worker, `ctx.of` serait toujours undefined → fallback `getOfConfig()` ENV-only → édition UI sans effet sur certificat/attestation. Fix : worker.ts charge `await loadOfConfig(payload.tenantId)` et populé `ctx.of`. Idem `wrapHtml({ of: ctx.of })` propage au footer.

- **Found during:** Task 3
- **Fix:** Worker pré-résout `of` une fois par job, propage via `ctx.of`. `wrapHtml` accepte `of?` et propage à `renderCorpFooter(opts.of)`.
- **Verification:** `grep -c "loadOfConfig" apps/web/src/lib/closure/worker.ts` = 1+
- **Committed in:** `1968c02` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug/critical drift, 2 missing critical functionality)
**Impact on plan:** Tous les auto-fixes étaient indispensables au respect du success criteria "0 process.env.OF_ outside of-config" + à la propagation BDD-first jusqu'aux closure templates. Aucun scope creep — tous strictement liés à l'objectif du plan.

## Issues Encountered

- **Prisma migrate dev échoue sur `updatedAt` required** : la migration initiale a ajouté `updatedAt DateTime @updatedAt` sans default, ce qui casse les 1 row Tenant existant. Fix : `@default(now()) @updatedAt`.
- **Schema-engine lock zombie** : un appel `pnpm db:migrate` précédent avait laissé un schema-engine en background détenant le lock advisory Postgres (`pg_advisory_lock(72707369)`). Killed pid 96002 et relancé OK.
- **Test TS error sur `as T` casts** : 2 tests utilisaient `{ address: ... } as T` sans satisfaire toutes les props de `TenantInput`. Fix : `as unknown as T` casts explicites.

## User Setup Required

None — aucune ENV à ajouter. Les nouvelles ENV `OF_HANDICAP_REFERENT`, `OF_INVOICE_PREFIX`, `OF_LOGO_PATH`, `OF_SIGNATURE_*`, `OF_LEGAL_FORM`, `OF_LEGAL_MENTIONS`, `OF_RCS` sont **optionnelles** — `pick()` retourne fallback default (string vide ou 'FAC' / 'Laurent MARX').

## Next Phase Readiness

- **Plan 07-02 (Server Actions Paramètres + Zod + AuditLog)** peut démarrer : `Tenant.legalForm/legalMentions/iban/bic/emailFrom/invoicePrefix` existent en BDD, prêts à recevoir mutations via `prisma.tenant.update`.
- **Plan 07-03 (Upload assets logo + signatures)** peut démarrer : `Tenant.logoPath/signaturePedagoPath/signatureDirigeantPath` existent, dossier `public/of-assets/` matérialisé + gitignored.
- **Plan 07-04 (UI page Paramètres édition)** peut démarrer : `loadOfConfig(tenantId)` retourne tous les champs hybrid BDD/ENV — premier rendu de Paramètres pré-rempli automatiquement.

## Self-Check: PASSED

- File exists : `packages/db/prisma/migrations/20260514163617_phase_07_tenant_settings/migration.sql` ✓
- File exists : `apps/web/src/lib/__tests__/of-config.test.ts` ✓
- File exists : `apps/web/.gitignore` ✓
- File exists : `apps/web/public/.gitkeep` ✓
- Commit exists : `a7d3572` (Task 1) ✓
- Commit exists : `851d1c7` (Task 2) ✓
- Commit exists : `1968c02` (Task 3) ✓
- grep regression check : 0 process.env.OF_ outside of-config ✓
- tsc --noEmit : exit 0 ✓
- next build : OK ✓
- vitest run : 17/17 passed ✓

---
*Phase: 07-param-tres-organisme-ditables*
*Plan: 01*
*Completed: 2026-05-14*
