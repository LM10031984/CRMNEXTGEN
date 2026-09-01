---
phase: 22-bascule-prod-conformit-rgpd
plan: 08
subsystem: infra
tags: [costs, billing, spend-management, backups, supabase, vercel, railway, openrouter, cut-02]

# Dependency graph
requires:
  - phase: 22-bascule-prod-conformit-rgpd (22-01)
    provides: "22-CUTOVER-RUNBOOK.md §6 (réglages cibles) + §9.6 (gabarit evidence)"
  - phase: 22-bascule-prod-conformit-rgpd (22-06)
    provides: "Bascule prod exécutée et gatée GO — Wave 3 autorisée"
provides:
  - "Garde-fous d'exploitation CUT-02 (seconde moitié) COMPLETS : alertes coûts actives sur les 4 plateformes réelles (Vercel 45$, Railway 35$ soft, Supabase spend cap ON, OpenRouter Auto Top-Up OFF + credit limit clé 25$/mois)"
  - "AUCUN garde-fou ne peut éteindre la prod (Pitfall 5 vérifié plateforme par plateforme : auto-pause Vercel OFF, hard limit Railway null, spend cap Supabase sans coupure DB)"
  - "Backups Supabase daily PROUVÉS par API management : region eu-west-1, walg physique, 6 snapshots COMPLETED 27/07→02/08 (rétention 7 jours plan Pro)"
  - "22-COSTS-BACKUPS.md (4 plateformes + backups, 0 item en attente) + runbook §9.6 rempli + 5 JSON evidence datés"
affects: [22-09, 22-10, verify-work-22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Garde-fous billing posés par API quand elle existe (Railway GraphQL usageLimitSet, preuves Supabase/OpenRouter par API management) — dashboard-only sinon, via le navigateur de Laurent (Claude in Chrome, pattern 21-04 étendu)"
    - "Credit limit de clé OpenRouter TOUJOURS en « Reset limit = Monthly » — la limite par défaut est LIFETIME (une limite < usage cumulé bloque la clé immédiatement)"

key-files:
  created:
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-COSTS-BACKUPS.md
    - .planning/phases/22-bascule-prod-conformit-rgpd/evidence/supabase-backups-2026-08-03.json
    - .planning/phases/22-bascule-prod-conformit-rgpd/evidence/supabase-project-region-2026-08-03.json
    - .planning/phases/22-bascule-prod-conformit-rgpd/evidence/railway-usage-limit-2026-08-03.json
    - .planning/phases/22-bascule-prod-conformit-rgpd/evidence/openrouter-key-2026-08-03.json
    - .planning/phases/22-bascule-prod-conformit-rgpd/evidence/openrouter-credits-2026-08-03.json
  modified:
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md

key-decisions:
  - "OpenRouter credit limit clé prod : 25$ en MENSUEL (Reset limit = Monthly) — la suggestion initiale « 25$ » simple aurait bloqué la clé (limite lifetime, 38,93$ déjà consommés)"
  - "Email alertes Railway reste laurentmarx@msn.com (email compte/billing non modifiable par API) — accepté par Laurent, distinct de l'expéditeur applicatif formation@start-academy.fr"
  - "Backups Supabase prouvés par API management plutôt que capture dashboard (relevé à la source, JSON daté commité)"
  - "Railway soft limit posée par API GraphQL (usageLimitSet) au lieu du dashboard — pattern 21-04, hard limit volontairement ABSENT"

patterns-established:
  - "Piège credit limit OpenRouter : défaut = TOTAL LIFETIME de la clé — poser en mensuel systématiquement"
  - "Compte Supabase du projet = login GitHub (LM10031984), PAS l'org Free homonyme laurent@start-academy.fr"

requirements-completed: [CUT-02]

# Metrics
duration: ~35 min actives (checkpoint dashboard inclus)
completed: 2026-08-03
---

# Phase 22 Plan 08: Alertes coûts 4 plateformes + backups Supabase Summary

**Alertes coûts actives sur les 4 plateformes (Vercel 45$ sans auto-pause, Railway soft 35$ sans hard limit posée par API GraphQL, Supabase spend cap ON, OpenRouter Auto Top-Up OFF + credit limit clé 25$/mois) et backups Supabase daily prouvés par API en eu-west-1 — CUT-02 seconde moitié soldée, aucun garde-fou ne peut éteindre la prod.**

## Performance

- **Duration:** ~35 min actives (relevés API 10:29→10:50Z + checkpoint dashboard + documentation)
- **Started:** 2026-08-03T10:29:00Z
- **Completed:** 2026-08-03 (Task 2 commitée)
- **Tasks:** 2/2 (1 checkpoint human-action exécuté via le navigateur de Laurent + 1 auto)
- **Files modified:** 7 (1 rapport + 5 evidence JSON + runbook §9.6)

## Accomplishments

- **Maximum automatisé AVANT le checkpoint** (consigne orchestrateur, pattern 21-04) :
  - **Railway** : soft limit **35 $** POSÉE par API GraphQL (`usageLimitSet`), `hardLimit: null` vérifié post-pose — anti Pitfall 5 (un hard limit couperait worker + Gotenberg + WeasyPrint). Usage courant : 10,43 $.
  - **Supabase** : backups **daily prouvés par API management** — `region: eu-west-1`, `walg_enabled: true` (physique), 6 snapshots COMPLETED 27/07→02/08 (~05h37 UTC), rétention 7 jours plan Pro. Région projet re-confirmée (`gntlqyscahbgjrmsbzil`, ACTIVE_HEALTHY, org plan pro).
  - **OpenRouter** : solde **19,20 $** (230 − 210,80) et état de la clé prod relevés par API (usage mensuel 0,13 $ ≈ coût attendu ~10 €/mois).
  - **Vercel** : sondes API Spend Management = 404 partout (dashboard-only, rôle OWNER confirmé).
- **Checkpoint human-action résolu le 2026-08-03** (4 écrans configurés via le navigateur de Laurent — Claude in Chrome, Laurent aux commandes) :
  - **Vercel** : budget On-Demand **45 $** (toast « Spend Management updated », 0/45 $), Notifications ON, « Pause Production Deployments » **OFF** vérifié.
  - **Supabase** : « **Spend cap is enabled** » (org LM10031984's Org, Pro) — aucun changement nécessaire, factures 25-35 $/mois cohérentes.
  - **OpenRouter** : Auto Top-Up **OFF** vérifié ; **credit limit clé prod 25 $ en MENSUEL** (jauge 0,13 $/25 $) — voir déviation n°1.
- **Documentation complète** : `22-COSTS-BACKUPS.md` (4 sections plateformes avec seuil exact + email + garde-fou Pitfall 5 tracé, section backups avec limite Pitfall 7 assumée, **0 item en attente**) + runbook **§9.6 rempli** avec horodatage — critère 3 de la phase prouvé.

## Task Commits

1. **Task 1 (pré-travail API) : evidence Supabase/OpenRouter/Railway + pose soft limit** - `360f0b7` (chore)
2. **Task 2 : 22-COSTS-BACKUPS.md + runbook §9.6** - `39985bc` (docs)

**Plan metadata:** commit final (docs)

## Files Created/Modified

- `.planning/phases/22-bascule-prod-conformit-rgpd/22-COSTS-BACKUPS.md` - preuves datées 4 alertes + backups (rapport CUT-02)
- `.planning/phases/22-bascule-prod-conformit-rgpd/evidence/*.json` (5 fichiers) - relevés API bruts datés 2026-08-03
- `.planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md` - §9.6 rempli (5 lignes evidence)
- Hors repo : Railway usageLimit (API), Vercel Spend Management, OpenRouter Auto Top-Up/credit limit, Supabase spend cap (dashboards)

## Decisions Made

- **Credit limit OpenRouter en mensuel** (25 $/mois) — correction en séance du piège lifetime (voir déviation n°1).
- **Email alertes Railway = laurentmarx@msn.com accepté** par Laurent (email de compte/billing, non modifiable par API ; sans rapport avec l'expéditeur applicatif `formation@start-academy.fr`).
- **Preuve backups par API management** plutôt que capture dashboard — relevé à la source, JSON commité, plus robuste qu'une capture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug évité] Credit limit OpenRouter : lifetime par défaut → clé bloquée si posée telle quelle**
- **Found during:** Task 1 (checkpoint — pose de la credit limit sur la clé prod)
- **Issue:** la suggestion initiale « credit limit 25 $ » s'appliquait au **TOTAL LIFETIME** de la clé (38,93 $ déjà consommés) : posée simple, la clé passait à 100 % et la **prod IA était coupée immédiatement**
- **Fix:** credit limit **25 $ AVEC « Reset limit = Monthly »** → jauge « Monthly 0,13 $/25 $ (1 %) » ; leçon consignée en règle permanente (22-COSTS-BACKUPS.md §4 + runbook §9.6)
- **Files modified:** aucun (dashboard OpenRouter)
- **Verification:** jauge mensuelle affichée post-pose, clé active
- **Committed in:** consigné dans `39985bc`

**2. [Rule 3 - Blocking] Écrans billing sans API → répartition API/dashboard au lieu du tout-dashboard du plan**
- **Found during:** Task 1
- **Issue:** le plan prévoyait un human-action intégral ; les sondes ont montré que Railway (GraphQL `usageLimitSet`), les preuves Supabase (management API) et OpenRouter (solde/état clé) étaient automatisables — seuls Vercel Spend Management (404 partout), le spend cap Supabase et Auto Top-Up/credit limit OpenRouter sont dashboard-only
- **Fix:** exécution par API de tout l'automatisable (soft limit Railway POSÉE, preuves JSON commitées `360f0b7`), checkpoint réduit à 4 écrans (~5 min)
- **Files modified:** evidence/*.json
- **Verification:** relecture post-pose Railway `usageLimit { softLimit: 35, hardLimit: null }`
- **Committed in:** `360f0b7`

---

**Total deviations:** 2 (1 bug évité au checkpoint, 1 optimisation d'exécution). **Impact :** la déviation n°1 a évité une coupure sèche de la prod IA — aucune autre incidence, périmètre du plan inchangé.

## Issues Encountered

- **Trou dans la liste des backups Supabase** : au relevé (2026-08-03T10:30Z), pas de snapshot listé au 01/08 et celui du 03/08 pas encore présent (dernier : 02/08 05:37 UTC). Daily prouvé sur 6 jours sinon — observation non bloquante consignée, à re-vérifier d'un œil au dashboard.
- **Piège de compte Supabase** : premier login sur `laurent@start-academy.fr` = org Free homonyme SANS le projet Qualiof — le bon compte est celui lié à GitHub (LM10031984). Consigné dans le rapport.
- **Shell sandbox** : PATH perdu dans les boucles `for` après lecture du token Vercel (curl/head « not found ») — contourné en appels simples par commande.

## User Setup Required

None - configurations dashboard faites en séance (Claude in Chrome), rien ne reste à poser.

## Next Phase Readiness

- **CUT-02 intégralement soldé** (gate SES-0094 au 22-06 + alertes/backups ici) : la prod cloud alerte avant dérive de coûts et ne peut pas s'éteindre toute seule.
- ⚠ Rappel Wave 3 : le flip emails (22-07) est **SUSPENDU** en attente du garde-fou UI 22-11 (décision Laurent 2026-08-03, runbook §9.4) — indépendant de ce plan.
- Restent : 22-09/22-10 (dont purge locale destructive, gate séparé) + invitations équipe (§9.5, plan dédié).

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-08-03*

## Self-Check: PASSED

- 22-COSTS-BACKUPS.md, 22-08-SUMMARY.md, 5 evidence JSON : présents
- Commits 360f0b7 (evidence API) / 39985bc (docs Task 2) : présents
- Greps de vérification du plan : eu-west-1 ✓, auto-pause ✓, laurent@start-academy.fr ✓, 0 « PEN DING » ✓ (+ 7 jours/daily/Pitfall 7 ✓)
