---
phase: 22-bascule-prod-conformit-rgpd
plan: 05
subsystem: compliance
tags: [rgpd, dpa, registre-traitements, art-30, qualiopi, pdf-export, gotenberg]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "17-REGIONS.md — localisations EU verrouillées (Supabase eu-west-1, Vercel cdg1, Railway europe-west4)"
  - phase: 22-bascule-prod-conformit-rgpd (plan 22-02)
    provides: "Audit logs PII (console.* sans PII brut) — 2ᵉ moitié de RGPD-01"
provides:
  - "Registre des traitements art. 30 (docs/rgpd/REGISTRE-TRAITEMENTS.md, 8 traitements) VALIDÉ par Laurent le 2026-07-07 — GATE D-13 LEVÉ"
  - "7 fiches DPA honnêtes (docs/rgpd/dpa/) : openrouter, anthropic, supabase, vercel, railway, google, ovh-smtp"
  - "Export PDF reproductible via pipeline interne (apps/web/scripts/_export-registre-rgpd.ts)"
  - "Décision responsable de traitement : conservation CNI/RIB étendue (contrôles a posteriori financeurs)"
  - "Compte Google confirmé = WORKSPACE (DPA processeur CDPA inclus)"
affects: [22-06 (bascule prod — Wave 2 AUTORISÉE côté RGPD), runbook bascule (actions de preuve : ZDR OpenRouter, DPA dashboard Supabase, CDPA console Workspace)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Docs conformité versionnés dans docs/rgpd/ + export PDF via marked→renderHtmlToPdf (aucune nouvelle lib PDF)"]

key-files:
  created:
    - docs/rgpd/REGISTRE-TRAITEMENTS.md
    - docs/rgpd/REGISTRE-TRAITEMENTS.pdf
    - docs/rgpd/dpa/openrouter.md
    - docs/rgpd/dpa/anthropic.md
    - docs/rgpd/dpa/supabase.md
    - docs/rgpd/dpa/vercel.md
    - docs/rgpd/dpa/railway.md
    - docs/rgpd/dpa/google.md
    - docs/rgpd/dpa/ovh-smtp.md
    - apps/web/scripts/_export-registre-rgpd.ts
  modified: []

key-decisions:
  - "Gate D-13 LEVÉ : registre validé le 2026-07-07 par Laurent MARX, responsable de traitement — la Wave 2 (bascule 22-06) est autorisée côté RGPD"
  - "Amendement Laurent : scans CNI/RIB PAS supprimés après justification du financement — conservation alignée sur le dossier de financement/formation (contrôles a posteriori AGEFICE/OPCO/DREETS + cycle Qualiopi)"
  - "Compte Google = WORKSPACE confirmé (CDPA processeur) — variante compte gratuit supprimée de la fiche"
  - "2 limites acceptées : OpenRouter sans DPA signé en self-serve (mitigations ZDR/logging OFF) + backups Supabase non off-site (pg_dump hors vendor au backlog D-12)"
  - "RGPD-01 satisfait par sur-couverture : 7 sous-traitants réels documentés vs 6 listés au requirement (Upstash sorti, Google + OVH SMTP entrés — D-14)"

patterns-established:
  - "Fiches DPA honnêtes : URLs publiques re-vérifiées à la rédaction (HTTP 200 + date), trous signalés (jamais inventés), réponse auditeur préparée pour chaque limite"
  - "Export conformité : script _*.ts + marked + renderHtmlToPdf, footer in-body position:fixed 11pt, PDF committé dans le repo"

requirements-completed: [RGPD-01]

# Metrics
duration: ~45min (exécution active ; pause checkpoint overnight exclue)
completed: 2026-07-07
---

# Phase 22 Plan 05: Registre RGPD + fiches DPA (gate D-13) Summary

**Registre art. 30 (8 traitements) + 7 fiches DPA honnêtes + export PDF pipeline interne, VALIDÉS par Laurent le 2026-07-07 — gate D-13 levé, la bascule prod (22-06, Wave 2) est autorisée côté RGPD.**

## Performance

- **Duration:** ~45 min actifs (pause checkpoint humaine overnight non comptée)
- **Started:** 2026-07-06T20:23:44Z
- **Completed:** 2026-07-07T04:29:41Z (validation Laurent reçue au matin du 2026-07-07)
- **Tasks:** 4/4 (3 auto + 1 checkpoint human-verify)
- **Files modified:** 10 créés, 7 amendés post-validation

## Accomplishments

- **Registre des traitements art. 30 complet** (`docs/rgpd/REGISTRE-TRAITEMENTS.md`, v1.1) : 8 traitements (CRM 360°, préinscriptions+OCR IA, closure IA, facturation, emails, Google Calendar, RBAC, veille) avec finalité/base légale/catégories/durées/mesures techniques réelles (signed URLs TTL minutes, `SensitiveData`, RBAC 6 rôles, régions EU) + sections transverses (localisation 4 plateformes sourcée 17-REGIONS.md, transferts hors UE, registre des 7 sous-traitants, limites assumées).
- **7 fiches DPA honnêtes** (`docs/rgpd/dpa/`) : toutes les URLs DPA re-vérifiées HTTP 200 le 2026-07-06 avec date de vérification. Caveats obligatoires documentés : OpenRouter DPA signé = enterprise only (garanties réelles : non-rétention défaut + ZDR, réponse auditeur préparée), Anthropic = sous-sous-traitant sans relation contractuelle directe, Google = 2 variantes rédigées puis figée Workspace au checkpoint.
- **Export PDF reproductible** : `_export-registre-rgpd.ts` (registre + 7 fiches concaténées, saut de page entre fiches, marked → `renderHtmlToPdf`, footer in-body `position:fixed` 11pt — jamais le footer Gotenberg natif). PDF 209 Ko committé, 0 nouvelle dépendance PDF.
- **GATE D-13 LEVÉ** : validation explicite de Laurent (responsable de traitement) le 2026-07-07, AVANT toute circulation de PII prod. **Cette validation autorise la Wave 2 (plan 22-06, bascule production).**

## Task Commits

Each task was committed atomically (`--no-verify`, exécuteur parallèle) :

1. **Task 1: Registre des traitements art. 30** - `42f41b1` (docs)
2. **Task 2: 7 fiches DPA sous-traitants** - `73187cf` (docs)
3. **Task 3: Export PDF pipeline interne** - `c2aaf2e` (docs)
4. **Task 4: Gate D-13 — amendements post-validation + PDF régénéré** - `f4241a9` (docs)

## Files Created/Modified

- `docs/rgpd/REGISTRE-TRAITEMENTS.md` - Registre art. 30, v1.1 validée (8 traitements, 7 sous-traitants, limites assumées acceptées)
- `docs/rgpd/REGISTRE-TRAITEMENTS.pdf` - Export imprimable auditeur Qualiopi/CNIL (209 Ko, régénéré post-validation)
- `docs/rgpd/dpa/{openrouter,anthropic,supabase,vercel,railway,google,ovh-smtp}.md` - 7 fiches DPA (gabarit commun, gaps honnêtes)
- `apps/web/scripts/_export-registre-rgpd.ts` - Export PDF reproductible (`dotenv -e ../../.env -- tsx scripts/_export-registre-rgpd.ts`)

## Decisions Made (checkpoint D-13, réponses Laurent 2026-07-07)

1. **Compte Google = GOOGLE WORKSPACE** → fiche `google.md` figée sur la variante CDPA processeur, variante gratuite supprimée. Action de preuve restante : capturer l'acceptation DPA/CCT dans la console admin Workspace (runbook).
2. **Amendement conservation CNI/RIB** : PAS de suppression après justification du financement — durée alignée sur le dossier de financement/formation. Justification (décision responsable de traitement 2026-07-07) : disponibilité pour les contrôles a posteriori des financeurs (AGEFICE, OPCO, DREETS) et le cycle Qualiopi. Marqueur « À VALIDER » retiré.
3. **Autres durées validées telles quelles** ; 2 limites assumées **acceptées** (OpenRouter self-serve sans DPA signé, backups Supabase non off-site).

## Deviations from Plan

None - plan executed exactly as written. (La vérification des URLs DPA a été faite par `curl` HTTP au lieu de WebFetch — équivalent fonctionnel, toutes 200.)

## Issues Encountered

None.

## Requirement RGPD-01 — complet

RGPD-01 exige : registre complet + DPA documentés + audit `console.*` sans PII brut, AVANT circulation PII prod.

- Registre + DPA : **ce plan** (sur-couverture : 7 sous-traitants réels D-14 vs 6 listés — Upstash sorti car plus utilisé, Google + OVH SMTP entrés).
- Audit logs PII : **plan 22-02** (livré, SUMMARY présent — logs masqués worker/mailer, commit `6871aac`).
- Validation AVANT PII prod : gate D-13 levé le 2026-07-07, la bascule (22-06) n'a pas encore eu lieu. ✅ **RGPD-01 marqué complet.**

## User Setup Required

None côté code. **3 actions de preuve à intégrer au runbook de bascule (22-01/22-06)** :
1. OpenRouter : vérifier + capturer logging OFF / ZDR sur le compte.
2. Supabase : vérifier + capturer l'acceptation du DPA dans le dashboard org.
3. Google Workspace : vérifier + capturer l'acceptation DPA/CCT dans la console admin.

## Next Phase Readiness

- **Gate D-13 LEVÉ → Wave 2 (22-06 bascule production) AUTORISÉE côté RGPD.** Le SUMMARY acte explicitement que la validation du registre par le responsable de traitement autorise la circulation des PII prod dans les conditions documentées.
- Registre versionné + PDF reproductible : prêt pour l'audit Qualiopi (renouvellement RNQ V9).

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-07-07*

## Self-Check: PASSED

- 11 fichiers vérifiés présents sur disque (registre .md/.pdf, 7 fiches DPA, script export, SUMMARY)
- 4 commits vérifiés : 42f41b1, 73187cf, c2aaf2e, f4241a9
