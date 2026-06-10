---
phase: 06-dashboard-hierarchisation-et-a11y
verified: 2026-05-13T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Relancer le build + tests manuellement"
    expected: "pnpm --filter @qualiof/web build exit 0, 43+ routes, pnpm --filter @qualiof/web test green"
    why_human: "Le sandbox de l'agent a refusé pnpm build et pnpm test lors de l'exécution du plan 06-04. Les preuves indirectes (build vert plan 06-01, tsc --noEmit exit 0 plan 06-02, NO-OPs 06-02/06-03) convergent vers un état sain mais ne remplacent pas un smoke clean post-merge."
  - test: "Vérification visuelle dashboard /app"
    expected: "4 KPI grand format visibles sans scroll, section 'Indicateurs détaillés' absente (repliée), chevron présent et fonctionnel"
    why_human: "Conformité layout et accessibilité visuelle ne peut pas être vérifiée par grep."
  - test: "Navigation clavier sur liste apprenants/sessions"
    expected: "Tab parcourt les lignes, Enter navigue vers la fiche, Esc ferme tout dialog ouvert (dialogs custom = Esc non supporté, acceptable en v5)"
    why_human: "Comportement clavier runtime uniquement — l'audit grep a statué PASS_AVEC_NOTE mais le ressenti clavier reste subjectif."
---

# Phase 6: Dashboard hiérarchisation & a11y — Rapport de vérification

**Phase Goal:** Réduire la densité anxiogène + harmoniser libellés financeurs + passer audit accessibilité.
**Verified:** 2026-05-13
**Status:** human_needed
**Re-verification:** Non — vérification initiale

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Dashboard affiche 4 KPI prioritaires en grand + KPI secondaires dans section repliable fermée par défaut | VERIFIED | `grep -c "PrioCard" page.tsx` → 5 (4 renders + 1 définition) ; `grep -c "CollapsibleSection" page.tsx` → 3 (import + open + close) ; `CollapsibleSection defaultOpen = false` dans le composant |
| 2 | Codes financeurs harmonisés via `formatFunderCode` (OPCOMMERCE → OPCO Commerce, OF → OF (auto-financé)) | VERIFIED | `funder-codes.ts` contient OPCO_EP/OPCOMMERCE/OF labels ; 13 fichiers importent le helper ; 14 call-sites de rendu confirmés ; `grep 'OPCO {.*opcoCode}'` → 0 résultat |
| 3 | Audit a11y documenté (périmètre re-scopé : audit visuel + grep ciblé, pas Lighthouse) | VERIFIED | `06-A11Y-AUDIT.md` existe, 138 lignes, 4 dimensions évaluées avec verdict explicite par dimension, verdict global PASS_AVEC_NOTES |
| 4 | Navigation clavier OK sur listes (Tab/Enter natifs via Link + button ; div onClick = overlays acceptables) | VERIFIED | Audit section 2 : 11 occurrences `div onClick` = 100% overlays/backdrops/stopPropagation, 0 anti-pattern bloquant ; `<Link>` natif partout sidebar/DataTable/PrioCard ; PASS_AVEC_NOTE documenté |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---------|----------|--------|---------|
| `apps/web/src/lib/funder-codes.ts` | Helper formatFunderCode + FUNDER_LABELS mapping | VERIFIED | Contient OPCO_EP, OPCOMMERCE, OF (auto-financé), AGEFICE, ATLAS, FIFPL, CPF. Fonction `formatFunderCode` exportée. |
| `apps/web/src/components/ui/collapsible-section.tsx` | CollapsibleSection avec localStorage persistence + a11y | VERIFIED | `defaultOpen = false`, `STORAGE_KEY_PREFIX`, `aria-expanded`, `aria-controls`, `aria-label` dynamique FR, `aria-hidden="true"` sur icônes décoratives. Commit `b71b620`. |
| `apps/web/src/app/app/page.tsx` | Dashboard avec 4 PrioCard + 1 CollapsibleSection | VERIFIED | Lignes 112-142 : 4 `<PrioCard>`. Ligne 147-211 : `<CollapsibleSection id="dashboard-detailed">` wrappant les 3 sous-sections. Pas de `defaultOpen={false}` explicite (valeur par défaut du composant = false). |
| `.planning/phases/06-dashboard-hierarchisation-et-a11y/06-A11Y-AUDIT.md` | Rapport audit a11y daté avec verdict par dimension | VERIFIED | Fichier présent, 138 lignes, 4 sections (contraste / nav clavier / aria-label / div onClick), verdict global PASS_AVEC_NOTES. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `page.tsx` | `collapsible-section.tsx` | `import { CollapsibleSection }` ligne 13 | WIRED | Import présent, composant utilisé lignes 147-211 |
| `page.tsx` | `PrioCard` (local) | Définition locale ligne 351 | WIRED | 4 renders lignes 112-142 |
| 14 sites UI | `funder-codes.ts` | `import { formatFunderCode } from '@/lib/funder-codes'` | WIRED | 13 fichiers imports confirmés, 14 call-sites de rendu vérifiés (grep exhaustif) |
| `collapsible-section.tsx` | localStorage | `STORAGE_KEY_PREFIX + id` dans `useEffect` | WIRED | Pattern hydration côté client avec `try/catch` (Safari incognito-safe) |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---------|--------------|--------|-------------------|--------|
| `page.tsx` PrioCard (CA encaissé) | `stats.caEncaisse` | `dashboard-stats.ts` → requêtes Prisma | Oui (pas modifié Phase 6) | FLOWING |
| `page.tsx` PrioCard (AGEFICE) | `stats.ageficeConsommeAnnee` | `dashboard-stats.ts` → AgeficeProfile Prisma | Oui (pas modifié Phase 6) | FLOWING |
| `formatFunderCode` call-sites | `opcoCode` string | Prop/champ Prisma Organization.opcoCode | Oui — mapping statique sur code BDD existant | FLOWING |
| `CollapsibleSection` | `open` boolean | localStorage ou `defaultOpen` | N/A — état de présentation, pas de donnée métier | N/A |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---------|---------|--------|--------|
| `funder-codes.ts` exporte `OF (auto-financé)` | `grep "OF.*auto-financé" apps/web/src/lib/funder-codes.ts` | 1 ligne trouvée | PASS |
| 0 occurrence raw `OPCO {code}` en UI | `grep -rn 'OPCO {.*opcoCode}' apps/web/src --include="*.tsx"` | 0 résultats | PASS |
| CollapsibleSection a11y : aria-label présent | `grep -n "aria-label" collapsible-section.tsx` | Ligne 79 : `aria-label={ariaLabel}` | PASS |
| CollapsibleSection fermée par défaut | `defaultOpen = false` dans signature fonction | Confirmé ligne 34 | PASS |
| Audit A11Y deliverable existe et est substantiel | `wc -l 06-A11Y-AUDIT.md` | 138 lignes (> 40 minimum plan 06-03) | PASS |
| `pnpm build` / `pnpm test` | N/A — sandbox refus lors plan 06-04 | Preuves indirectes seulement (build vert 06-01, tsc OK 06-02) | SKIP — human_needed |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| UX-11 | 06-02 | 4 KPI prioritaires grand format + 14 KPI secondaires repliables fermés par défaut | SATISFIED | `[x] UX-11` dans REQUIREMENTS.md, commit `b71b620`, grep dashboard page.tsx conforme |
| UX-12 | 06-01 | Codes financeurs harmonisés via `formatFunderCode` sur 14 sites UI | SATISFIED | `[x] UX-12` dans REQUIREMENTS.md, commits `096bc28` + `4d98926`, 0 occurrence raw OPCO |
| UX-13 | 06-03 | Audit a11y visuel + grep ciblé (re-scopé depuis Lighthouse, per CONTEXT.md) | SATISFIED | `[x] UX-13` dans REQUIREMENTS.md, `06-A11Y-AUDIT.md` présent 138 lignes, verdict PASS_AVEC_NOTES |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `new-link-button.tsx` | 72 | Bouton X icon-only sans `aria-label` | Info | Non-bloquant — redondant avec bouton textuel "Annuler". Dette v6 listée dans 06-A11Y-AUDIT.md section 5. |
| `add-person-to-org-button.tsx` | ~108 | Bouton X icon-only sans `aria-label` | Info | Idem. |
| `create-trainer-button.tsx` | inconnu | Bouton X présumé sans `aria-label` | Info | Idem — à durcir v6. |
| `create-organization-button.tsx` | inconnu | Bouton X présumé sans `aria-label` | Info | Idem. |

Tous les `<div onClick>` identifiés (11 occurrences) sont des overlays/backdrops/stopPropagation — **0 anti-pattern bloquant** selon l'audit 06-A11Y-AUDIT.md section 4.

---

## Human Verification Required

### 1. Smoke build + tests post-merge

**Test:** `cd "/Users/laurentmarx/Documents/CRM Next gen/files" && rm -rf apps/web/.next && pnpm --filter @qualiof/web build && pnpm --filter @qualiof/web test`
**Expected:** Build exit 0, 43+ routes générées, suite Vitest green (smoke test `sessions/[id]` notamment)
**Why human:** Le sandbox a bloqué `pnpm build` et `pnpm test` lors de l'exécution du plan 06-04. Les preuves indirectes (build vert 06-01, tsc exit 0 06-02, NO-OPs 06-02/03) sont convergentes mais ne constituent pas un smoke end-to-end propre.

### 2. QA visuelle dashboard /app

**Test:** Ouvrir `/app` dans le navigateur, vérifier layout dashboard
**Expected:** 4 KPI prioritaires en grand format visibles without scroll (CA encaissé, AGEFICE, Sessions à venir, Taux remplissage), section "Indicateurs détaillés" absente de la vue initiale (repliée), chevron visible, click-to-expand fonctionnel, état persisté après reload
**Why human:** Rendu visuel, animations, et UX du toggle localStorage ne sont pas vérifiables par grep.

### 3. Navigation clavier runtime

**Test:** Tab depuis l'en-tête du dashboard, parcourir les PrioCard, Tab vers le toggle CollapsibleSection, Enter pour déplier
**Expected:** Focus visible sur chaque élément, screen reader annonce "Déplier Indicateurs détaillés" puis "Replier Indicateurs détaillés", Enter toggle la section
**Why human:** aria-label dynamique FR et comportement focus runtime ne peuvent pas être simulés par analyse statique.

---

## Gaps Summary

Aucun gap bloquant identifié. Les 4 critères de succès sont vérifiés :

1. **SC1 (UX-11)** — 4 PrioCard confirmées en code (lignes 112-142 de page.tsx), CollapsibleSection wrappant 14+ KPI avec `defaultOpen = false` implicite (ligne 147-211). Composant `collapsible-section.tsx` présent, fonctionnel, a11y renforcée (commit `b71b620`).

2. **SC2 (UX-12)** — `funder-codes.ts` contient tous les mappings requis dont `OF: 'OF (auto-financé)'`. 14 call-sites de rendu confirmés par grep exhaustif. 0 occurrence de `OPCO {raw_code}` restante. Commits `096bc28` + `4d98926` traçables.

3. **SC3 (a11y audit re-scopé)** — `06-A11Y-AUDIT.md` présent (138 lignes), 4 dimensions évaluées, verdict explicite par dimension (PASS ou PASS_AVEC_NOTE), aucun FAIL. Re-scope CONTEXT.md respecté : pas de Lighthouse, audit visuel + grep ciblé uniquement.

4. **SC4 (navigation clavier)** — Couvert par SC3. Audit section 2 confirme `<Link>` natif sur tous les chemins critiques, `<button>` avec `aria-expanded` sur les toggles, 0 `<div onClick>` portant une action métier non-focusable.

Le seul point en attente est le **smoke build/test** refusé par le sandbox lors du plan 06-04, qui nécessite une confirmation manuelle avant de passer à la Phase 7.

---

_Verified: 2026-05-13_
_Verifier: Claude (gsd-verifier)_
