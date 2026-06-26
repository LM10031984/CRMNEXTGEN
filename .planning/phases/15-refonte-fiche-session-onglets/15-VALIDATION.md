---
phase: 15
slug: refonte-fiche-session-onglets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (`apps/web`) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @qualiof/web test -- <pattern>` |
| **Full suite command** | `pnpm --filter @qualiof/web test` |
| **Estimated runtime** | ~30-60 seconds (suite web) |

---

## Sampling Rate

- **After every task commit:** Run quick test for the touched area
- **After every plan wave:** Run full suite (`pnpm --filter @qualiof/web test`)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Filled by gsd-planner. Each task maps to a Vitest assertion. Source unique d'état = clé de non-divergence.

| Task ID | Plan | Wave | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | unit (routage onglet `?tab=`) | `pnpm --filter @qualiof/web test -- session-tabs` | ❌ W0 | ⬜ pending |
| TBD | 02 | 2 | unit (non-divergence récap/onglets — même `getSessionCompleteness`) | `pnpm --filter @qualiof/web test -- doc-completion` | ✅ | ⬜ pending |
| TBD | 03 | 3 | unit (idempotence agenda — déjà prouvée Phase 14) | `pnpm --filter @qualiof/web test -- calendar` | ✅ | ⬜ pending |
| TBD | 04 | 4 | unit (prédicat sûr clôture batch zombie : ne clôt jamais un batch actif récent) | `pnpm --filter @qualiof/web test -- closure-batch` | ❌ W0 | ⬜ pending |

---

## Validation Architecture (de 15-RESEARCH.md §8)

- **Lot 1 (coquille onglets)** : routage `?tab=` déterministe ; onglet par défaut = Session ; survit à `router.refresh()`. Test de puissance : forcer un tab inconnu → fallback Session.
- **Lot 2 (réembarquer + supprimer)** : non-divergence — récap (« Tous les documents ») et onglets de phase lisent le MÊME `getSessionCompleteness`. Test : muter le compte de docs côté source → les deux surfaces bougent ensemble. Garde-fou suppression : grep prouvant 0 consommateur résiduel de `DocDockDrawer`/`SessionOnlyDocsBlock` après réembarquement, et `dispatchGenerateMissing`/`dispatchGenerateDoc` toujours appelés depuis l'onglet « Avant ».
- **Lot 3 (agenda)** : réutilise la suite calendar Phase 14 (52 tests). Idempotence re-sync = 0 doublon (clé déterministe).
- **Lot 4 (produit + nettoyage)** : prédicat de clôture batch zombie testé sur 3 cas — (a) batch RUNNING stale >15min sans job actif → clos, (b) batch RUNNING avec job PROCESSING récent → NON touché, (c) batch COMPLETED → ignoré. DRY-run par défaut.

---

## Wave 0 Requirements

- [ ] `apps/web/src/components/sessions/__tests__/session-tabs.test.tsx` — routage onglet (Lot 1)
- [ ] Test prédicat clôture batch zombie (Lot 4) — fichier à créer par le planner

*Le reste de l'infrastructure (doc-completion, calendar) existe déjà.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Lisibilité onglets + suppression scroll | Visuel | Ouvrir `:3010/app/sessions/<id>`, vérifier 5 onglets, 1 doc à 1 endroit, plus de cartes minuscules |
| Bug tarif dupliqué en-tête | Runtime | Vérifier en-tête sans « € / stagiaire € / stagiaire » (peut être déjà corrigé — cf. RESEARCH Q7) |
| Plus aucun batch zombie affiché | Runtime | Après nettoyage, fiche session sans « pack en cours » fantôme |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
