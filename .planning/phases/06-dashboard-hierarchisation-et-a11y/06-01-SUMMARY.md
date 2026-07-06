---
phase: 06-dashboard-hierarchisation-et-a11y
plan: 01
subsystem: ui-helpers
tags:
  - ux-12
  - funder-codes
  - rendering
  - a11y-prep
dependency_graph:
  requires:
    - apps/web/src/lib/funder-codes.ts (helper existant, juste aligné)
  provides:
    - "formatFunderCode appliqué uniformément sur 14 sites UI"
  affects:
    - apps/web/src/app/app/organisations/page.tsx
    - apps/web/src/app/app/organisations/[id]/page.tsx
    - apps/web/src/app/app/dossiers-opco/page.tsx
    - apps/web/src/app/app/dossiers-opco/envoyer/[id]/page.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/app/app/apprenants/[id]/page.tsx
    - apps/web/src/app/app/formateurs/[id]/page.tsx
    - apps/web/src/app/app/financeurs/page.tsx
    - apps/web/src/app/app/financeurs/[code]/page.tsx
    - apps/web/src/components/editors/legal-link-editor.tsx
    - apps/web/src/components/sessions/gap-row.tsx
    - apps/web/src/components/apprenants/learner-quick-view-button.tsx
    - apps/web/src/components/pickers/person-or-org-picker.tsx (in-scope ajouté)
tech_stack:
  added: []
  patterns:
    - "Affichage code financeur : toujours via formatFunderCode (BDD garde le raw)"
key_files:
  created: []
  modified:
    - apps/web/src/lib/funder-codes.ts
    - apps/web/src/app/app/dossiers-opco/envoyer/[id]/page.tsx
    - apps/web/src/app/app/financeurs/page.tsx
    - apps/web/src/app/app/financeurs/[code]/page.tsx
    - apps/web/src/components/editors/legal-link-editor.tsx
    - apps/web/src/components/sessions/gap-row.tsx
    - apps/web/src/components/apprenants/learner-quick-view-button.tsx
    - apps/web/src/components/pickers/person-or-org-picker.tsx
decisions:
  - "OF label aligné sur CONTEXT.md D-02 : 'OF (auto-financé)' (préfixe OF inclus)"
  - "Suppression du préfixe 'OPCO ' redondant devant le code dans tous les badges"
  - "Extension du scope plan : person-or-org-picker.tsx ajouté (in-scope par critère d'acceptation : grep 'OPCO {.*opcoCode}' doit retourner 0)"
metrics:
  duration_seconds: ~600
  completed_date: 2026-05-13
  tasks_completed: 2
  files_modified: 8
  commits: 2
---

# Phase 06 Plan 01: Funder Codes Harmonization (UX-12) Summary

**One-liner:** Centralisation du rendu des codes financeurs (`OPCOMMERCE` → "OPCO Commerce", `OPCO_EP` → "OPCO EP") via le helper `formatFunderCode` appliqué sur 14 sites UI, sans toucher à la BDD.

## Tasks Executed

### Task 1 — Aligner `funder-codes.ts` avec CONTEXT.md D-02

- **Commit:** `096bc28`
- **Files:** `apps/web/src/lib/funder-codes.ts`
- **Change:** Label `OF` mis à jour `'Auto-financé'` → `'OF (auto-financé)'`
- **Verify:** 4 greps de présence (OK)

### Task 2 — Wiring du helper sur 7 sites UI nouveaux

- **Commit:** `4d98926`
- **Files:** 7 fichiers modifiés (voir `key_files.modified` ci-dessus, hors funder-codes.ts)
- **Change:** Import du helper + remplacement de chaque affichage RAW d'un code financeur par `formatFunderCode(...)`. Toutes les comparaisons logiques `=== 'AGEFICE'` et les clauses Prisma `where: { opcoCode: ... }` sont restées **inchangées** (intentionnel).
- **Verify:**
  - 14 fichiers utilisent `formatFunderCode` (cible plan ≥ 11)
  - 13 fichiers importent `from '@/lib/funder-codes'`
  - `grep -rn "OPCO {.*opcoCode}" apps/web/src --include="*.tsx"` → 0 ligne (cible plan)
  - 8 occurrences `opcoCode === 'AGEFICE'` toujours présentes (logique métier préservée)
  - `pnpm --filter @qualiof/web build` → vert (43 routes générées)

## Sites UI déjà alignés à l'arrivée du plan

Les 6 fichiers ci-dessous utilisaient déjà `formatFunderCode` avant l'exécution (probablement de premier passage Phase 6 antérieur). Ils ont été **vérifiés** mais pas re-modifiés :

- `apps/web/src/app/app/organisations/page.tsx` (cellule OPCO du DataTable)
- `apps/web/src/app/app/organisations/[id]/page.tsx` (subtitle RecordRecentVisit + badge en-tête)
- `apps/web/src/app/app/dossiers-opco/page.tsx` (badge sponsor en colonne)
- `apps/web/src/app/app/sessions/[id]/page.tsx` (badge sponsor par participant)
- `apps/web/src/app/app/apprenants/[id]/page.tsx` (badge sponsorOrg)
- `apps/web/src/app/app/formateurs/[id]/page.tsx` (badge organisation subOrg)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - In-scope] Ajout de person-or-org-picker.tsx**

- **Found during:** Task 2 verification
- **Issue:** Le critère d'acceptation `grep -rn "OPCO {.*opcoCode}" apps/web/src --include="*.tsx"` exigeait 0 résultat, or `apps/web/src/components/pickers/person-or-org-picker.tsx:208` contenait encore le pattern `<Badge variant="info">OPCO {link.organization.opcoCode}</Badge>`.
- **Fix:** Ajout de l'import `formatFunderCode` + remplacement du badge raw — cohérent avec l'objectif UX-12.
- **Files modified:** `apps/web/src/components/pickers/person-or-org-picker.tsx`
- **Commit:** `4d98926`

## Authentication Gates

Aucune — exécution autonome de bout en bout.

## Known Stubs

Aucun stub introduit dans ce plan.

## Self-Check: PASSED

- `apps/web/src/lib/funder-codes.ts` contient `OF: 'OF (auto-financé)'` → FOUND
- 14 fichiers contiennent `formatFunderCode` (cible ≥ 11) → FOUND
- 0 occurrence `"OPCO {.*opcoCode}"` restante → FOUND
- 8 occurrences `opcoCode === 'AGEFICE'` préservées (logique) → FOUND
- Commits `096bc28` (Task 1) et `4d98926` (Task 2) existent dans `git log` → FOUND
- Build `pnpm --filter @qualiof/web build` → vert → FOUND
