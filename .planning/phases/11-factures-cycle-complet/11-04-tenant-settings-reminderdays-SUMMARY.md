---
phase: 11-factures-cycle-complet
plan: 04
subsystem: ui
tags: [zod, rhf, settings, rbac, audit-log, factures, invoices, reminders, credit-note]

requires:
  - phase: 11-00
    provides: Migration Prisma Tenant.creditNotePrefix + Tenant.invoiceReminderDays + Invoice +3 colonnes
  - phase: 07
    provides: Pattern SettingsSection + tenant-settings.ts (requireRole ADMIN, computeDiff, logTenantSettingsChange action='parameters.update')
  - phase: 08
    provides: requireRole(['ADMIN']) + UnauthorizedError + ForbiddenError + matrice PERMISSIONS
provides:
  - 3 schémas Zod centralisés Factures dans @qualiof/shared (CreateCreditNoteSchema + InvoiceReminderSettingsSchema + ExportInvoicesQuerySchema)
  - Server action updateInvoiceReminderSettings ADMIN-only avec AuditLog parameters.update
  - Section UI "Facturation — Relances et avoirs" éditable dans /app/parametres
affects: [11-05, 11-06, 11-07]

tech-stack:
  added: []
  patterns:
    - "Schémas Zod centralisés dans @qualiof/shared/schemas/invoice.ts pour réutilisation cross-plan"
    - "Server action Phase 11 réutilise convention Phase 7 AuditLog (entity='Tenant' / action='parameters.update') car édition de config tenant"
    - "InvoiceSettingsForm accepte onSaved/onCancel props pour s'intégrer au pattern SettingsSection Phase 7-04"
    - "Validation client (Zod safeParse) AVANT server roundtrip pour UX immédiate sur format invalide"

key-files:
  created:
    - packages/shared/src/schemas/invoice.ts
    - packages/shared/src/schemas/__tests__/invoice.test.ts
    - apps/web/src/server/actions/invoice-settings.ts
    - apps/web/src/server/actions/__tests__/invoice-settings.test.ts
    - apps/web/src/components/parametres/invoice-settings-form.tsx
    - apps/web/src/components/parametres/__tests__/invoice-settings-form.test.ts
  modified:
    - packages/shared/src/schemas/index.ts (ajout `export * from './invoice'`)
    - apps/web/src/app/app/parametres/page.tsx (insertion section 4bis "Facturation — Relances et avoirs" entre Numérotation factures et Coordonnées bancaires)

key-decisions:
  - "Réutiliser logTenantSettingsChange Phase 7 (entity='Tenant' / 'parameters.update') plutôt que logInvoiceEvent (Plan 11-02) car on édite la config tenant, pas une facture"
  - "creditNotePrefix Zod optional pour permettre de modifier uniquement les délais sans risquer d'écraser le préfixe à null en BDD"
  - "Validation Zod côté client AVANT server roundtrip — UX immédiate sur format invalide (toast.error avec premier message d'erreur)"
  - "Saisie délais en CSV `30, 45` parsé en number[] avant safeParse plutôt qu'un multi-array dynamique — UX simple pour 1-3 valeurs"
  - "InvoiceSettingsForm prend onSaved/onCancel props pour s'intégrer au pattern Phase 7-04 SettingsSection (toggle Modifier/Annuler)"

patterns-established:
  - "Tests source-regex D-Phase9-N appliqués au form Phase 11 (6 tests : use client + imports + ids + disabled isPending + sonner + a11y htmlFor/aria-describedby)"
  - "Mock @qualiof/db doit fournir LegalForm + UserRole enums (transit via @qualiof/shared/constants/legal-form.ts) — pattern Phase 9.1-02"

requirements-completed:
  - FACT-02
  - FACT-03

duration: 6min
completed: 2026-05-19
---

# Phase 11 Plan 04: tenant-settings-reminderdays Summary

**Section UI "Facturation — Relances et avoirs" ADMIN-only dans /app/parametres permettant d'éditer creditNotePrefix (séquence avoirs CGI 289) et invoiceReminderDays (array 1-3 entiers strictement croissants), avec 3 schémas Zod centralisés réutilisables par Plans 11-05/06/07.**

## Performance

- **Duration:** ~6 min (parallèle Wave 1b avec 11-01/02/03)
- **Started:** 2026-05-19T15:51:30Z
- **Completed:** 2026-05-19T15:58:10Z
- **Tasks:** 3 (TDD: Test→Green pour Tasks 1+2, source-regex pour Task 3)
- **Files créés:** 6
- **Files modifiés:** 2

## Accomplishments

- **3 schémas Zod centralisés** dans `@qualiof/shared/schemas/invoice.ts` (CreateCreditNoteSchema + InvoiceReminderSettingsSchema + ExportInvoicesQuerySchema). Validation stricte : array strictement croissant 1-3 items, regex `[A-Z0-9]{1,8}` pour préfixe avoirs, `z.coerce.date` pour ISO strings query.
- **Server action `updateInvoiceReminderSettings` ADMIN-only** avec RBAC Phase 8 (`requireRole(['ADMIN'])`), AuditLog Phase 7 (`entity='Tenant' / action='parameters.update'`), computeDiff per-champ → no-op AuditLog si rien ne change, `revalidatePath('/app/parametres')`.
- **Section UI Paramètres** insérée APRÈS "Numérotation factures" via SettingsSection (pattern Phase 7-04). ReadView affiche les 2 valeurs en font-mono, EditView wrappe `<InvoiceSettingsForm>` avec onSaved/onCancel render-prop.
- **Anti-régression** : 6 sections Phase 7-04 intactes, 457 tests apps/web verts (+6 vs avant), 72 tests shared verts (+16 vs avant), tsc clean.

## Task Commits

Each task was committed atomically with `--no-verify` (Wave 1b parallèle) :

1. **Task 1 RED — Tests Zod schemas** : `90fe28b` (test: add failing tests for invoice Zod schemas — 14 tests it.fail sur file non existant)
2. **Task 1 GREEN — Zod schemas centralisés** : `86bb6d0` (feat: Zod schemas centralisés Factures — 16 tests vitest verts, 3 schémas exportés via packages/shared)
3. **Task 2 RED — Tests server action** : `1fb3b21` (test: add failing tests for updateInvoiceReminderSettings — 8 tests sur ../invoice-settings non existant)
4. **Task 2 GREEN — Server action** : `7a85295` (feat: server action updateInvoiceReminderSettings ADMIN-only — 8 tests verts + mock LegalForm/UserRole Rule 3)
5. **Task 3 — UI form + page extension** : `7aad831` (feat: section Facturation Relances+avoirs — 6 tests source-regex verts + page parametres étendue chirurgicalement)

## Files Created/Modified

### Créés
- `packages/shared/src/schemas/invoice.ts` — 3 schémas Zod centralisés (CreateCreditNoteSchema / InvoiceReminderSettingsSchema / ExportInvoicesQuerySchema)
- `packages/shared/src/schemas/__tests__/invoice.test.ts` — 16 tests vitest (12 du plan + 4 sanity)
- `apps/web/src/server/actions/invoice-settings.ts` — server action `updateInvoiceReminderSettings` ADMIN-only avec AuditLog Phase 7
- `apps/web/src/server/actions/__tests__/invoice-settings.test.ts` — 8 tests vitest (6 du plan + 2 sanity : no-op + creditNotePrefix omis)
- `apps/web/src/components/parametres/invoice-settings-form.tsx` — client form RHF + Zod safeParse + sonner + onSaved/onCancel render-prop SettingsSection
- `apps/web/src/components/parametres/__tests__/invoice-settings-form.test.ts` — 6 tests source-regex D-Phase9-N

### Modifiés (chirurgicaux, anti-régression Phase 7-04)
- `packages/shared/src/schemas/index.ts` — ajout `export * from './invoice'`
- `apps/web/src/app/app/parametres/page.tsx` — import Receipt + InvoiceSettingsForm + nouvelle SettingsSection 4bis insérée entre sections 4 et 5

## Decisions Made

- **D-11-04-A : Réutiliser `logTenantSettingsChange` Phase 7** plutôt que `logInvoiceEvent` (Plan 11-02). Justification : on édite la config tenant (creditNotePrefix + invoiceReminderDays sont des colonnes Tenant), pas une row Invoice. La convention `entity='Tenant' / action='parameters.update'` Phase 7 D-09 est la source de vérité pour les paramètres OF. `logInvoiceEvent` reste à utiliser quand on modifie une facture (création, paiement, relance, avoir).
- **D-11-04-B : `creditNotePrefix` Zod optional**. Permet de modifier UNIQUEMENT les délais sans envoyer de préfixe — le server action préserve la valeur courante (`...(parsed.data.creditNotePrefix !== undefined ? { creditNotePrefix } : {})`). Évite le risque de write `null` accidentellement si le form omet le champ.
- **D-11-04-C : Validation Zod côté client AVANT server roundtrip**. UX immédiate sur format invalide (toast.error avec `parsed.error.issues[0].message`), évite un appel server + retour `{ ok:false, fieldErrors }` pour un format clairement invalide. Le server revalide quand même (defense-in-depth — un utilisateur peut bypasser le JS).
- **D-11-04-D : Saisie délais en CSV `30, 45` parsée client-side** plutôt qu'un multi-array dynamique. Justification : pour 1-3 valeurs, UX plus rapide qu'un FormArray RHF + boutons add/remove. Le hint sous le label explique le format attendu. Si Plan 11-06 a besoin de plus de granularité, peut évoluer.
- **D-11-04-E : InvoiceSettingsForm intégré au pattern SettingsSection Phase 7-04** via `onSaved/onCancel` props (render-prop SettingsSection.editView). Cohérence visuelle avec les 6 sections Phase 7-04 (toggle Modifier/Annuler), évite la friction d'un form "permanent edit mode".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Mock `@qualiof/db` doit fournir LegalForm + UserRole enums**

- **Found during:** Task 2 (server action `updateInvoiceReminderSettings`)
- **Issue:** Le test fail au chargement avec `LegalForm.SAS` undefined dans `packages/shared/src/constants/legal-form.ts:10`. Cause : `@qualiof/shared` (transit via `@qualiof/shared/index → constants/index → legal-form`) importe `LegalForm` depuis `@qualiof/db`, mais le mock `@qualiof/db` du test ne fournissait que `prisma`. C'est exactement le même pattern Phase 9.1-02 D-Phase9.1 déjà rencontré.
- **Fix:** Ajout du mock `LegalForm` + `UserRole` enums dans `vi.mock('@qualiof/db', ...)` (clone strict du pattern tenant-settings.test.ts Phase 7).
- **Files modified:** `apps/web/src/server/actions/__tests__/invoice-settings.test.ts`
- **Verification:** 8/8 tests verts après le fix.
- **Committed in:** `7a85295` (Task 2 commit — fix appliqué directement, pas de commit séparé)

**2. [Rule 2 — Missing Critical] Bouton "Annuler" ajouté au form**

- **Found during:** Task 3 (extension page Paramètres)
- **Issue:** Le pattern SettingsSection Phase 7-04 attend `editView(onSaved, onCancel)` mais le form du plan ne déclarait que `{ initial }`. Sans bouton Annuler, l'utilisateur ne peut pas quitter le mode édition sans soumettre — UX cassée.
- **Fix:** Ajouter props `onSaved?: () => void` + `onCancel?: () => void`. Bouton Annuler en `<button type="button">` avec `onClick={onCancel}`. Appelle `onSaved?.()` après save réussi.
- **Files modified:** `apps/web/src/components/parametres/invoice-settings-form.tsx`
- **Verification:** Form correctement intégré dans SettingsSection.editView, tests passent.
- **Committed in:** `7aad831` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking + 1 missing critical UX)
**Impact on plan:** Aucun scope creep. Les 2 fixes sont des corrections nécessaires (Rule 3 = test ne tournait pas sinon, Rule 2 = bouton Annuler critique pour UX cohérente Phase 7-04).

## Issues Encountered

- Aucun blocage majeur. Le pattern Phase 9.1-02 (mock LegalForm) a été reproduit sans friction.
- La dépendance `logInvoiceEvent` (Plan 11-02) mentionnée dans `<critical_notes>` du prompt s'est révélée non nécessaire : la réflexion D-11-04-A a confirmé qu'on doit utiliser `logTenantSettingsChange` Phase 7 (édition config tenant, pas facture). Aucun stub TODO laissé.

## Next Phase Readiness

**Plans Wave 2 débloqués** (consommateurs des schémas Zod) :
- **Plan 11-05** (créer avoir) peut maintenant `import { CreateCreditNoteSchema } from '@qualiof/shared'` (uuid + montant positif + motif ≥3 chars).
- **Plan 11-06** (worker relances) peut maintenant lire `prisma.tenant.findUnique({ select: { invoiceReminderDays: true } })` et utiliser le format validé.
- **Plan 11-07** (export comptable) peut maintenant `import { ExportInvoicesQuerySchema } from '@qualiof/shared'` pour valider la query string de la route `/api/factures/export`.

**Section UI Paramètres** opérationnelle : Laurent peut configurer ses préférences sans passer par SQL.

**Conventions confirmées :**
- AuditLog `entity='Tenant' / action='parameters.update'` étendu Phase 11 (Tenant.creditNotePrefix + Tenant.invoiceReminderDays).
- Pattern mock `LegalForm` + `UserRole` enums dans `@qualiof/db` documenté (Phase 9.1-02 reproduit).

## Self-Check: PASSED

Vérifications après écriture SUMMARY.md :

- `[ -f packages/shared/src/schemas/invoice.ts ]` → FOUND
- `[ -f apps/web/src/server/actions/invoice-settings.ts ]` → FOUND
- `[ -f apps/web/src/components/parametres/invoice-settings-form.tsx ]` → FOUND
- `[ -f apps/web/src/components/parametres/__tests__/invoice-settings-form.test.ts ]` → FOUND
- `git log --oneline | grep 90fe28b` → FOUND (Task 1 RED)
- `git log --oneline | grep 86bb6d0` → FOUND (Task 1 GREEN)
- `git log --oneline | grep 1fb3b21` → FOUND (Task 2 RED)
- `git log --oneline | grep 7a85295` → FOUND (Task 2 GREEN)
- `git log --oneline | grep 7aad831` → FOUND (Task 3)
- Tests : shared 72/72 + apps/web 457/457 (+ 53 it.todo réservés Wave 0)

---

*Phase: 11-factures-cycle-complet*
*Plan: 04 (tenant-settings-reminderdays)*
*Completed: 2026-05-19*
