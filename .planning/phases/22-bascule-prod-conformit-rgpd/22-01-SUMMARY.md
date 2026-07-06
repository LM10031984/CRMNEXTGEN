---
phase: 22-bascule-prod-conformit-rgpd
plan: 01
subsystem: infra
tags: [cutover, runbook, rollback, vercel, railway, supabase, env-vars, mail-dry-run]

# Dependency graph
requires:
  - phase: 20-worker-3-h-te-doc-engines
    provides: "20-DEPLOY.md — pattern runbook non-technicien dashboard-first, tableau ~15 vars worker Railway"
  - phase: 21-app-vercel-filet-ci-tests
    provides: "21-DEPLOY-VERCEL.md — modèle de forme (tableaux de vars, §9 evidence datée), staging gardé LIVE qualiof.vercel.app"
provides:
  - "22-CUTOVER-RUNBOOK.md complet §0–§9 : pré-requis fenêtre, sanity env D-18 ②, 2 flips, gate SES-0094, rollback D-04, gabarit evidence"
  - "Sections numérotées référençables par les plans d'exécution 22-06..22-10"
  - "Plan de rollback écrit AVANT la fenêtre (tableau exact var→valeur, ~5 min, base cloud reste la vérité)"
affects: [22-06, 22-07, 22-08, 22-09, 22-10, verify-work-22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runbook composé : fusion 20-DEPLOY (Railway) + 21-DEPLOY-VERCEL (Vercel), non-technicien dashboard-first"
    - "Evidence au fil de l'eau : gabarit §9 daté rempli par les plans exécutants, jamais après coup"

key-files:
  created:
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md
  modified: []

key-decisions:
  - "Chemin nominal 100 % dashboard pour Laurent : toutes les commandes CLI/tsx citées sont explicitement exécutées par Claude (pattern délégation 21-04)"
  - "NO-GO au gate SES-0094 = rollback §8 immédiat, diagnostic à froid — jamais de debug en prod ouverte (seuil 30 min pour les erreurs env)"
  - "Les 3 vars Google restent posées en cas de rollback : la garde staging sync-session.ts:84 re-bloque le sync d'elle-même"

patterns-established:
  - "Gabarit evidence par section : tableau Preuve/Attendu/Résultat/Date, sous-sections 9.1–9.7 mappées sur les plans 22-06..22-10"

requirements-completed: [CUT-01]

# Metrics
duration: 4min
completed: 2026-07-06
---

# Phase 22 Plan 01: Runbook de bascule + plan de rollback Summary

**Runbook de bascule prod complet §0–§9 (415 lignes) : 2 flips gatés (NEXT_PUBLIC_APP_ENV=production puis MAIL_DRY_RUN=false Vercel ET Railway), gate SES-0094 go/no-go, rollback re-flag staging ~5 min, gabarit evidence 9.1–9.7 — écrit AVANT la fenêtre (CUT-01 littéral)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-06T20:23:13Z
- **Completed:** 2026-07-06T20:27:46Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `22-CUTOVER-RUNBOOK.md` créé : composition des runbooks 20-DEPLOY (Railway) et 21-DEPLOY-VERCEL (Vercel), style non-technicien dashboard-first, sections numérotées exactement §0–§9 pour référence par les plans 22-06..22-10.
- **Tous les garde-fous des décisions D-01..D-18 et des Pitfalls 1-10 intégrés** :
  - §0 : fenêtre conditionnée à Phase 20 close + `22-DATA-GAP-AUDIT.md` PASS + storage 0 lien mort + sanity env + gate RGPD (7 fiches DPA) + CI verte (merge commit jamais squash) ;
  - §1 : sanity check env D-18 ② en 3 volets — `sanity-check-env.ts` (regex `[^\x20-\x7E]|#| +$`) sur les vars relisibles, re-pose des sensitive depuis source assainie (Pitfall 2, leçon PROD-0674) + preuve comportementale auto-fill IA, règle « jamais de ligne .env brute avec ` # …` dans un dashboard » ;
  - §2 : Flip 1 avec les **3** vars Google sensitive (Pitfall 3 — valeurs référencées par chemin de fichier, jamais copiées), `MAIL_DRY_RUN` reste `true` partout, redeploy obligatoire (`NEXT_PUBLIC_*` inliné au build) ;
  - §3 : gate SES-0094 avec les 6 critères Phases 20/21 (0 stub `usedStub=false`, footer 22 vars OF_*, 0 404, `%PDF-`, sans filigrane D-08) ;
  - §4 : séquence stricte D-06 — `22-PENDING-SENDS-REPORT.md` incluant les relances brûlées en dry-run (Pitfall 1) → validation Laurent + décision remédiation compteurs → flip sur **DEUX** plateformes (Pitfall 10) → preuve messageId réel ;
  - §6 : alertes coûts 4 plateformes SANS auto-pause Vercel ni hard limit Railway bas (Pitfall 5), backups Supabase daily eu-west-1 en capture ;
  - §7 : case « notifier les apprenants » devient réelle (Pitfall 4), jamais d'envoi de masse, crons CRON_SECRET débranchés, conduite 402 OpenRouter, MinIO non purgé (→ 22-10).
- **§8 rollback D-04** : tableau exact 3 lignes (`NEXT_PUBLIC_APP_ENV=staging` + `MAIL_DRY_RUN=true` ×2), redeploy Vercel / redeploy auto Railway, critères de déclenchement, base cloud reste la vérité (jamais de restore local), vérification post-rollback ~2 min.
- **§9 gabarit evidence** : 7 sous-sections datées vides (9.1 sanity env → 9.7 purge locale), mappées sur les plans exécutants.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rédiger le runbook de bascule (§0–§7, chemin nominal)** - `3cfaefe` (docs)
2. **Task 2: Plan de rollback (§8) + gabarit evidence (§9) + contrôle de cohérence** - `f7be03e` (docs)

## Files Created/Modified

- `.planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md` - Runbook de bascule complet (415 lignes, 10 sections §0–§9) : pré-requis, sanity env, 2 flips, gate go/no-go, invitations, alertes/backups, avertissements, rollback, gabarit evidence.

## Decisions Made

- Chemin nominal sans CLI pour Laurent : chaque commande technique du runbook est explicitement marquée « exécutée par Claude » (pattern délégation 21-04) — critère d'acceptance « non-technicien » satisfait sans appauvrir la précision technique.
- Les variables SMTP (OVH :465) sont listées au §4.3 comme à poser au moment du Flip 2 si absentes (elles sont volontairement NON posées sur Vercel en staging — dry-run garanti par leur absence + `MAIL_DRY_RUN=true`).
- NO-GO = rollback immédiat + diagnostic à froid, avec seuil explicite de 30 min pour toute erreur env non diagnostiquée.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Results

- `grep -c "^## §"` = 10 (§0–§9) ; 415 lignes ≥ 200 (min_lines).
- 3 vars `GOOGLE_OAUTH_*` distinctes (Pitfall 3) ; `MAIL_DRY_RUN` présent en §2 (reste true) ET §4 (flip ×2 dont Railway sur la même ligne — key_link).
- §3 : SES-0094 + « 0 stub » + « 22 vars OF_* » + « 404 » + « filigrane » présents.
- §6 : « auto-pause » et « hard limit » présents (anti-Pitfall 5).
- §8 : tableau 3 lignes exact, `NEXT_PUBLIC_APP_ENV=staging` littéral (key_link), « cloud reste la vérité » ×4.
- §9 : 7 sous-sections 9.1–9.7 ; artefacts `sanity-check-env.ts` / `22-PENDING-SENDS-REPORT.md` / `22-DATA-GAP-AUDIT.md` tous référencés.
- Aucun secret en clair : les valeurs Google sont référencées par chemin de fichier (`files/secrets/*.json`) uniquement.

## User Setup Required

None - no external service configuration required (le runbook DÉCRIT les configurations, les plans 22-06..22-10 les exécuteront).

## Next Phase Readiness

- CUT-01 partie « runbook + rollback écrits AVANT la fenêtre » satisfaite : un lecteur non-technicien peut dérouler bascule ET rollback depuis ce seul document.
- Les plans 22-06..22-10 peuvent référencer les sections §1–§9 sans ambiguïté.
- Dépendances de la fenêtre rappelées au §0 : clôture Phase 20 (relevé 24 h attendu 2026-07-07 ~08h45) + audits 22-03/22-04 + gate RGPD 22-05.

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: .planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md
- FOUND: .planning/phases/22-bascule-prod-conformit-rgpd/22-01-SUMMARY.md
- FOUND: commit 3cfaefe (Task 1)
- FOUND: commit f7be03e (Task 2)
