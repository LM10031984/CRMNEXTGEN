---
phase: quick-260618-ot9
plan: 01
subsystem: docs-qualiopi (footers PDF + normalisation programme)
tags: [footer, doc-version, programme, multi-jours, vence, qualiopi]
requirements: [COR-1, COR-2, COR-3]
dependency_graph:
  requires:
    - of-config.ts (getOfConfig ENV-only footers ; loadOfConfig DB Tenant corps des docs)
    - programme-normalize.ts (buildHoraireScaffold multi-jours, quick 260618-jy1)
  provides:
    - "doc-version.ts : const partagée DOC_VERSION='V2 du 01/03/2025'"
    - "renderHoraireScaffoldMd : grille horaire multi-jours dédupliquée (« Organisation des journées »)"
  affects:
    - Programme.pdf / Convention.pdf (corps + footer)
    - tous les PDF OF (footers paged WeasyPrint + Gotenberg)
tech_stack:
  added: []
  patterns:
    - "Source unique de version doc via const partagée importée (pas de littéral dupliqué)"
    - "Dédup horaire multi-jours : horaire mentionné 1× ; mono-jour strictement inchangé"
key_files:
  created:
    - apps/web/src/lib/doc-version.ts
  modified:
    - .env (gitignored — non commité)
    - apps/web/src/lib/of-paged-footer.ts
    - apps/web/src/lib/of-pdf-footer.ts
    - apps/web/src/lib/programme-normalize.ts
    - apps/web/src/lib/closure/qualiopi-prompts.ts
    - apps/web/src/lib/__tests__/programme-normalize.test.ts
  db:
    - "Tenant.address (jsonb) UPDATE → Vence (UPDATE 1, vérifié au SELECT)"
decisions:
  - "DOC_VERSION en const partagée unique (doc-version.ts) importée par les 2 footers — aucun littéral dupliqué"
  - "Dédup multi-jours via branche nbJours>1 ; branche nbJours===1 laissée intacte (déroulé slice mono-jour + PROD-0062)"
  - "Ligne synthétique « Chaque journée (8h) — Matin : … » formulée pour exposer le motif /Matin : 9h00/ attendu par le test de puissance"
metrics:
  duration: ~5 min
  completed: 2026-06-18
  tasks: 3
  files: 6 (+1 DB UPDATE, +1 .env local non commité)
  commits: 2 (Task 1 = config + DB, sans fichier versionné)
---

# Quick 260618-ot9 : Footer Vence + V2 du 01/03/2025 + programme multi-jours dédupliqué — Summary

3 corrections sur les documents Qualiopi générés (branche `cloud-migration`, sans worktree) : adresse OF alignée sur le site Vence (footers via `.env` + corps via DB Tenant), footers PDF versionnés « V2 du 01/03/2025 » via une const partagée unique, et programme multi-jours affichant la grille horaire une seule fois sous « Organisation des journées » au lieu d'un bloc par jour.

## What Was Built

### COR-1 — Adresse OF = Vence
- `.env` (gitignored, non commité) : `OF_ADDRESS_STREET="618 Bd Jean Maurel Inférieur"`, `OF_ADDRESS_CP="06140"`, `OF_ADDRESS_VILLE="Vence"` → consommé par les footers (`getOfConfig` ENV-only).
- DB Tenant `db191440-…647f2c` : `UPDATE Tenant SET address = jsonb_build_object('street','618 Bd Jean Maurel Inférieur','postalCode','06140','city','Vence','country','France')` → **UPDATE 1**, vérifié au SELECT (`{"city":"Vence","street":"618 Bd Jean Maurel Inférieur","country":"France","postalCode":"06140"}`). Consommé par le corps des docs (`loadOfConfig`).
- Aucun fichier versionné à committer pour cette tâche (config locale + donnée runtime).

### COR-2 — Footers PDF versionnés (commit `4221954`)
- Nouveau `apps/web/src/lib/doc-version.ts` : `export const DOC_VERSION = 'V2 du 01/03/2025' as const;` (source unique).
- `of-paged-footer.ts` (WeasyPrint, 11pt) + `of-pdf-footer.ts` (Gotenberg, 36pt) importent `DOC_VERSION` et ajoutent une ligne discrète après le contact (`<br><span>` gris #64748B, 9pt resp. 24pt). Aucune chaîne littérale `'V2 du 01/03/2025'` dupliquée dans les footers.

### COR-3 — Programme multi-jours : horaire affiché 1× (commit `f0b8d58`)
- `renderHoraireScaffoldMd` :
  - `nbJours === 1` : **strictement inchangé** (un seul `### Jour 1`, format historique, consigne « recopier »). Préserve la slice mono-jour du déroulé (`ollama-generators.ts:734`) et PROD-0062.
  - `nbJours > 1` : section unique `### Organisation des journées` + une ligne synthétique « Chaque journée (8h) — Matin : 9h00–13h00 · Pause déjeuner … · Après-midi : 14h00–18h00 … ». Si le dernier jour est PARTIEL (helper `isJourPlein` + `describeJourPartiel`), une ligne dédiée « Dernier jour (jour N) : matin 9h00–10h00 (matin seul) — 1h. » est ajoutée. Plus de bloc horaire répété par jour.
- `qualiopi-prompts.ts` : `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` ajusté (horaire mentionné 1× sous « Organisation des journées », contenu réparti par jour `### Jour K`, horaires NON recopiés par jour). Règles FIDÉLITÉ (décliner-pas-enrichir) et VERBES D'ACTION conservées → `enforceProgrammeFidelity` préservé. `PROMPT_VERSION` bumpé `v8 → v9`.
- Tests `programme-normalize.test.ts` adaptés : 72h → `### Organisation des journées` présent, pas de `### Jour 9`, `/Matin : 9h00/g`, `/9h00–13h00/g`, `/14h00–18h00/g` chacun length === 1 ; 105h → bloc plein 1× (`/Chaque journée/g` ×1) + ligne dernier jour partiel `9h00–10h00` ×1 ; 8h → `### Jour 1` seul, pas de section multi-jours (non-régression).

## Verification

- COR-1 : `OK-COR1` (grep `.env` ×3 + SELECT DB city=Vence).
- COR-2 : `doc-version.ts` présent, `DOC_VERSION` importé par les 2 footers, aucun littéral dupliqué, tsc 0 nouvelle erreur.
- COR-3 : `Organisation des journées` présent, `pnpm --filter @qualiof/web exec vitest run programme-normalize` → **27 passed (27)**, tsc 0 nouvelle erreur.
- tsc global (`pnpm --filter @qualiof/web exec tsc --noEmit`) : 0 erreur hors préexistants documentés (redirect-308.test.ts, sessions.ts(804) legalName, shared-template.test.ts Test6 jpeg).

### Test de puissance (déterministe)
Branche multi-jours temporairement cassée (rendu per-day) → les tests 72h & 105h virent **RED** (2 failed) → restaurée → **27 passed**. Les tests gardent réellement la dédup.

## Deviations from Plan

None — plan exécuté tel qu'écrit. Note : la ligne synthétique multi-jours utilise le préfixe « Matin : » (et non « Chaque journée : … » seul) pour exposer le motif `/Matin : 9h00/` mentionné dans la consigne du test de puissance ; déjà prévu par le plan (« e.g. /Matin : 9h00/g »).

## Constraints respected
- Branche `cloud-migration`, pas de worktree. Commits atomiques, staging des seuls fichiers concernés.
- WIP Laurent NON touché (ROADMAP/STATE/produits[id]/edit-product-button/session-location-picker/crud-edits/tsbuildinfo + scripts `_*.ts` + PDF facture restent unstaged/untracked).
- Worker Ollama NON touché. AUCUNE génération réelle lancée. Base Docker touchée uniquement par l'UPDATE Tenant prévu.
- ROADMAP.md NON modifié (conformément à la consigne).

## Self-Check: PASSED

Tous les fichiers (doc-version.ts, 2 footers, programme-normalize.ts, qualiopi-prompts.ts, test, SUMMARY) présents. Commits 4221954 + f0b8d58 présents.
