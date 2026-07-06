---
phase: 17-fondations-cloud-r-gion-eu-env
plan: 01
subsystem: infra
tags: [cloud, region, eu, rgpd, supabase, vercel, railway, fly, upstash, qualiopi]

# Dependency graph
requires:
  - phase: v6-roadmap
    provides: Roadmap v6 Prod Cloud (Phases 17-22), décisions D-01/D-02 verrouillées au plan-time
provides:
  - "17-REGIONS.md : verrouillage écrit auditable des régions cloud EU des 4 plateformes (source de vérité pré-création)"
  - "Décision D-01 Paris (Supabase eu-west-3 + Vercel cdg1) documentée"
  - "Décision D-02 Upstash conditionnel (décision Phase 20) documentée"
  - "Checklist pré-création anti-défaut-US (4 items) pour Phases 18/19/20"
affects: [18-supabase-storage, 19-base-postgres, 20-worker-3e-hote, 22-bascule-prod-rgpd]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc .planning/ structuré et grep-vérifiable comme contrat auditable pré-création cloud"
    - "Codes région exacts + statut immutabilité par plateforme dans une table unique"

key-files:
  created:
    - .planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md
  modified: []

key-decisions:
  - "D-01 : Région = Paris (Supabase eu-west-3 + Vercel cdg1) — résidence FR prime sur ~10ms de latence pour un OF français à 2-5 users"
  - "D-02 : Upstash conditionnel — documenté (eu-central-1 Frankfurt si Redis retenu Phase 20), aucun compte/DB créé en Phase 17"
  - "Irréversibilité cadrée : SEULE Supabase est immuable ; le vrai risque = défaut US silencieux à la création"

patterns-established:
  - "Verrouillage écrit des choix cloud irréversibles AVANT création (garde-fou anti-défaut-US)"

requirements-completed: [CLOUDENV-01]

# Metrics
duration: 1min
completed: 2026-07-04
---

# Phase 17 Plan 01: Verrouillage écrit des régions cloud EU Summary

**`17-REGIONS.md` : source de vérité auditable qui verrouille par écrit la région EU (Paris) des 4 plateformes cloud — Supabase `eu-west-3`, Vercel `cdg1`, Railway `europe-west4`/Fly `cdg`, Upstash `eu-central-1` conditionnel — AVANT toute création de projet, garde-fou contre le défaut régional US silencieux.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-07-04T13:38:04Z
- **Completed:** 2026-07-04T13:39:06Z
- **Tasks:** 1
- **Files modified:** 1 (créé)

## Accomplishments

- Document `.planning/` auditable créé : un lecteur (auditeur Qualiopi, DPO) peut vérifier « région = EU » pour les 4 plateformes sans ambiguïté.
- Codes région EU exacts listés par plateforme : `eu-west-3` (Supabase Paris), `cdg1` (Vercel Paris), `europe-west4`/`cdg` (Railway/Fly), `eu-central-1`/`eu-west-1` (Upstash).
- Décision D-01 (Paris, résidence FR) et D-02 (Upstash conditionnel, décision Phase 20 WORK-02) intégrées et justifiées.
- Distinction irréversibilité : Supabase seule immuable (recréer + migrer) vs Vercel/Railway/Upstash mutables ; vrai risque = défaut US silencieux.
- Checklist pré-création anti-défaut-US de 4 items pour dérouler en Phase 18/19/20.

## Task Commits

1. **Task 1: Créer 17-REGIONS.md — verrouillage écrit des régions EU** - `25defba` (docs)

## Files Created/Modified

- `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` - Verrouillage écrit auditable des régions cloud EU des 4 plateformes (titre + date + statut, décision D-01 Paris, table 4 plateformes avec code région/immutabilité/procédure EU, section Upstash conditionnel D-02, section irréversibilité, checklist pré-création 4 items, sources docs officielles vérifiées 2026-07-04).

## Decisions Made

- **Réponse au critère « 4 plateformes »** : formulée comme **3 fermes (Supabase, Vercel, Railway/Fly) + 1 conditionnelle (Upstash)**, per D-02 et Open Question Q1 du research — évite de bloquer Phase 17 sur une décision Phase 20.
- **Railway/Fly non tranché** : les deux plateformes documentées (Railway `europe-west4` Amsterdam / Fly `cdg` Paris), décision finale déférée à Phase 20 conformément au plan.

## Deviations from Plan

None - plan executed exactly as written. Le doc a été rédigé avec les valeurs exactes imposées par le plan (D-01/D-02, table, checklist), et les 8 acceptance criteria grep passent.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required (Phase 17 = documentation/config uniquement, aucune création de projet cloud).

## Next Phase Readiness

- **Ready for 17-02** (CLOUDENV-02 : refonte `env.ts` fail-loud + 5 clés cloud + `turbo.json` globalEnv + retrait `DOC_ENGINE_URL`).
- Le verrouillage région étant écrit, les Phases 18 (Supabase Storage), 19 (Postgres), 20 (worker) disposent d'un contrat région EU auditable à consulter avant toute création — la checklist anti-défaut-US est prête à dérouler.

## Self-Check: PASSED

- FOUND: `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md`
- FOUND: `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-01-SUMMARY.md`
- FOUND commit: `25defba`

---
*Phase: 17-fondations-cloud-r-gion-eu-env*
*Completed: 2026-07-04*
