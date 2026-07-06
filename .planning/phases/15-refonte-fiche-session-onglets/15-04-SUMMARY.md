---
phase: 15-refonte-fiche-session-onglets
plan: 04
subsystem: closure-ops + session-ui
tags: [zombie-batches, worker-safe, dry-run-write, ai-draft-validation, rsc-frontier, tdd, no-op-verified]

# Dependency graph
requires:
  - phase: 15-refonte-fiche-session-onglets (15-03)
    provides: "Onglets Session/Avant/Après/Tous-docs/Agenda remplis (en-tête déjà allégé, toggle agenda déplacé)"
  - phase: 14-integration-google-calendar
    provides: "Pattern script destructif DRY→WRITE=1 (calendar:purge/backfill) réutilisé pour close-zombies"
provides:
  - "Prédicat pur worker-safe isZombieBatch + finalStatusFor (lib/closure/close-zombie-batches.ts) — 0 import auth/rendu"
  - "Script DRY/WRITE close-zombie-batches.ts + pnpm closure:close-zombies (DRY par défaut, WRITE=1 applique)"
  - "Validation programme IA RETIRÉE de la fiche session (lecture seule + lien produit) ; cible produit AiDraftValidationBanner intacte ; inline-ai-draft-validator.tsx SUPPRIMÉ (orphelin)"
  - "Tarif en-tête : NO-OP documenté (fix A3 vérifié, non reproductible) ; CTA NextActionHero confirmé piloté par sessionStage ; en-tête allégé confirmé"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prédicat métier PUR (isZombieBatch/finalStatusFor) séparé du script d'I/O — testable sans DB, worker-safe (chargé isolément par node/tsx sans crash boot 'cache is not a function')"
    - "Script destructif DRY→WRITE=1 (modèle Phase 14 calendar:purge) : DRY liste + statut cible, WRITE derrière env explicite, garde d'idempotence updateMany where status IN PENDING/RUNNING"
    - "finalStatusFor reproduit fidèlement bumpAndFinalize (worker.ts) : errorDocs===0 → COMPLETED ; doneDocs===0 → FAILED ; sinon PARTIAL"
    - "Retrait d'un composant client couplé à l'auth (InlineAiDraftValidator → crud-edits → auth cache) : débloque le test jsdom du parent serveur (StepCreation)"

key-files:
  created:
    - apps/web/src/lib/closure/close-zombie-batches.ts
    - apps/web/src/lib/closure/__tests__/close-zombie-batches.test.ts
    - apps/web/scripts/close-zombie-batches.ts
    - apps/web/src/components/sessions/__tests__/session-no-ai-validator.test.tsx
  modified:
    - apps/web/package.json
    - apps/web/src/components/sessions/step-creation.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/components/sessions/session-header-bar.tsx
  deleted:
    - apps/web/src/components/sessions/inline-ai-draft-validator.tsx

key-decisions:
  - "isZombieBatch/finalStatusFor gardés PURS (aucune I/O) dans lib/closure/ — importe uniquement les TYPES Prisma ClosureBatchStatus/ClosureJobStatus. Prouvé worker-safe non seulement par grep (0 react/requireRole/validateRequest) mais par import isolé node+tsx (module chargé, 3 exports, 0 crash)."
  - "Script DRY par défaut, WRITE=1 requis (pattern destructif memory). WRITE NON exécuté par l'agent : gate Laurent (comme calendar:purge). DRY-RUN exécuté → 4 batches zombies listés (= les « 4 packs en cours » fantômes du CONTEXT)."
  - "Validation IA = RETRAIT seulement (RESEARCH Q5) : la cible produit (AiDraftValidationBanner + validateAiDraftProduct) existe déjà et N'A PAS été touchée. Sur la session : programme lecture seule + badge « Brouillon IA — à valider sur la fiche produit » + lien /app/produits/{id}?tab=programme conservé."
  - "inline-ai-draft-validator.tsx SUPPRIMÉ car orphelin après retrait (grep : 0 autre consommateur). Prop canValidateAi retirée de StepCreation + page.tsx (plus de validation sur la session) ; productAiDraftedAt CONSERVÉ pour le badge lecture seule."
  - "Tarif en-tête = NO-OP documenté (RESEARCH Q7) : rendu either/or strict priceSlot vs bloc défaut ; SessionPriceInline porte « / stagiaire » dans son `display` SANS prop `suffix` (fix A3). Bug « 3 024 € / stagiaire € / stagiaire » non reproductible. Commentaire daté ajouté, aucune modif de code."
  - "CTA NextActionHero : confirmé piloté à 100% par stage.cta (source unique sessionStage) — status/current/reason/blocker/cta.{kind,href,label}, aucun calcul parallèle. NO-OP (déjà conforme)."

patterns-established:
  - "Test de zombie sûr : 3 cas (stale sans job actif → zombie ; job PROCESSING/QUEUED récent → intact ; COMPLETED/récent → ignoré) + mutation (retrait de la garde « job actif récent » → cas 2 vire ROUGE)."

requirements-completed: [FS-PROGRAMME-PRODUIT, FS-ZOMBIES, FS-CORRECTIFS]

# Metrics
duration: 33min
completed: 2026-07-01
---

# Phase 15 Plan 04 : Programme au produit + nettoyage batches zombies + correctifs Summary

**Lot 4 (dernier) : outil DRY/WRITE worker-safe de clôture des ClosureBatch « zombies » (prédicat pur `isZombieBatch` + script, DRY-run prouvé = 4 packs fantômes), retrait de la validation programme IA de la fiche session (lecture seule + lien produit, cible produit intacte, composant orphelin supprimé), et correctifs visuels résiduels vérifiés NO-OP (tarif en-tête fix A3, CTA `NextActionHero` piloté par `sessionStage`, en-tête allégé).**

## Performance

- **Duration:** ~33 min
- **Started:** 2026-07-01T16:07:40Z
- **Completed:** 2026-07-01T16:41:18Z
- **Tasks:** 4
- **Files:** 4 créés, 4 modifiés, 1 supprimé

## Accomplishments

- **Nettoyage batches zombies (outil livré, WRITE gaté Laurent) :**
  - Prédicat PUR `isZombieBatch(batch, jobs, now)` + `finalStatusFor(batch)` dans `lib/closure/close-zombie-batches.ts`. Un batch est zombie ssi PENDING/RUNNING **ET** stale > 15min (dernière activité `updatedAt`/`startedAt` < now-15min, ou inconnue) **ET** aucun job QUEUED/PROCESSING récent (< 15min). `finalStatusFor` calque `bumpAndFinalize` du worker (COMPLETED/FAILED/PARTIAL).
  - **Worker-safe prouvé DOUBLEMENT** : grep `from 'react'|requireRole|validateRequest` = 0, ET import isolé `node --input-type=module` + `tsx/esm` charge le module (3 exports, aucun crash `cache is not a function`).
  - Script `scripts/close-zombie-batches.ts` (pattern `calendar:purge`) : DRY par défaut (liste batches + statut cible), `WRITE=1` applique via `updateMany where status IN PENDING/RUNNING` → statut final + `completedAt` (garde d'idempotence contre une course worker). Filtre optionnel `SESSION_CODE`. `$disconnect` en finally. pnpm `closure:close-zombies` ajouté.
- **Validation IA retirée de la session** : `StepCreation` ne rend plus `InlineAiDraftValidator`. Le programme est en lecture seule (bloc existant + nouveau badge « Brouillon IA — à valider sur la fiche produit » quand `aiDraftedAt` non null) avec lien `/app/produits/{id}?tab=programme`. Prop `canValidateAi` retirée (StepCreation + page.tsx). `inline-ai-draft-validator.tsx` SUPPRIMÉ (orphelin). Cible produit (`AiDraftValidationBanner`, `validateAiDraftProduct`) **intacte**.
- **Correctifs visuels (NO-OP vérifiés)** : tarif en-tête non reproductible (either/or strict + `display` A3 sans `suffix`) → commentaire daté, 0 modif code ; CTA `NextActionHero` piloté par `stage.cta` (source unique `sessionStage`), 0 calcul parallèle ; en-tête allégé confirmé (`DocsButton`/`SessionCalendarSyncToggle` absents de `session-header-bar.tsx`).
- **TDD strict** RED→GREEN sur les 2 tests métier + **2 tests de puissance prouvés** au gate.

## Task Commits

1. **Task 1 (Wave 0) : test RED prédicat zombie** — `9812455` (test) — `close-zombie-batches.test.ts` : 3 cas + finalStatusFor 3 sous-assertions + garde QUEUED récent. RED (module absent).
2. **Task 2 : prédicat pur + script DRY/WRITE (GREEN)** — `fcf165b` (feat) — `close-zombie-batches.ts` (pur, worker-safe) + `scripts/close-zombie-batches.ts` + pnpm `closure:close-zombies`. 4/4 GREEN, mutation prouvée.
3. **Task 3 (RED puis GREEN)** — `e9c5364` (test RED) + `2a827ea` (feat) — retrait `InlineAiDraftValidator` de `StepCreation`, badge lecture seule + lien produit, suppression du composant orphelin, retrait prop `canValidateAi`. 3/3 GREEN, mutation prouvée.
4. **Task 4 : correctifs NO-OP** — `967ad09` (docs) — commentaire daté NO-OP tarif dans `session-header-bar.tsx` ; CTA + en-tête confirmés conformes. tsc clean, suite 1112 verts.

## DRY-RUN nettoyage zombies (résultat — ce qui SERAIT clos)

`pnpm --filter @qualiof/web closure:close-zombies` (DRY, lecture seule) a trouvé **5 batches PENDING/RUNNING**, dont **4 ZOMBIES** à clore (= exactement les « 4 packs en cours » fantômes décrits dans le CONTEXT). Le 5ᵉ batch ouvert est correctement PROTÉGÉ (non listé).

| Session | Batch | Statut | done | err | total | updatedAt | → cible |
|---|---|---|---|---|---|---|---|
| SES-0044 | 9e66235d… | RUNNING | 12 | 0 | 45 | 2026-06-18T17:40:53Z | COMPLETED |
| SES-0043 | 1ca1a8fa… | RUNNING | 12 | 0 | 81 | 2026-06-18T18:27:24Z | COMPLETED |
| SES-0057 | 7cb72eb5… | RUNNING | 2  | 0 | 18 | 2026-06-18T10:36:02Z | COMPLETED |
| SES-0042 | b025ea5f… | RUNNING | 3  | 0 | 27 | 2026-06-19T05:14:31Z | COMPLETED |

**Note à l'attention de Laurent (à lire avant le WRITE) :** `finalStatusFor` reproduit fidèlement la logique du worker (`bumpAndFinalize`), qui ne branche QUE sur `errorDocs`/`doneDocs`, pas sur « tous les docs traités ». Ces 4 zombies ont `errorDocs=0` mais `doneDocs < totalDocs` (ex. 12/45) → statut cible **COMPLETED**. C'est cohérent avec l'interface fournie par le plan (même règle que le worker) : ils seront marqués COMPLETED alors que tous les jobs n'ont pas tourné. Effet réel = ils cessent d'apparaître « en cours » (objectif). Si tu préfères que ces batches partiellement traités deviennent PARTIAL/FAILED plutôt que COMPLETED, on ajustera `finalStatusFor` (petit changement ciblé) — dis-le avant le WRITE.

## ⚠️ WRITE À FAIRE PAR LAURENT (destructif, NON exécuté par l'agent)

Le WRITE (fermeture réelle) reste **gaté** (pattern destructif memory, comme `calendar:purge`). Séquence :
1. `cd apps/web && pnpm closure:close-zombies` — DRY, revoir la liste ci-dessus.
2. `WRITE=1 pnpm closure:close-zombies` — clôture réelle (updateMany → statut final + completedAt).
3. `pnpm closure:close-zombies` — re-DRY → doit afficher **0 zombie**.

Filtre ciblé possible : `SESSION_CODE=SES-0044 pnpm closure:close-zombies`.

## Statut du tarif dupliqué

**NO-OP (déjà corrigé, non reproductible).** Le rendu de `session-header-bar.tsx` est un either/or strict : `priceSlot ? priceSlot : (pricePerLearner !== null && <défaut/>)` — jamais les deux. `SessionPriceInline` porte « X € / stagiaire » dans son `display` (Intl currency) **sans** passer de prop `suffix` à `EditableField` (fix A3, commentaire L58-61 du composant). Le bug « 3 024 € / stagiaire € / stagiaire » n'est pas reproductible. Commentaire daté ajouté près du bloc tarif ; **aucune modif de code** (pas de régression réintroduite).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ajout de `expanded` dans le test session-no-ai-validator pour rendre le body**
- **Found during:** Task 3 (GREEN)
- **Issue:** `StepCreation` rend son corps (bloc programme + lien produit) uniquement quand `TimelineStep` est ouvert (`isOpen`, dérivé de `expanded`, défaut `false`). Sans `expanded`, `querySelectorAll('a')` renvoyait `[]` → 2 tests rouges à tort.
- **Fix:** `expanded: true` ajouté aux `baseProps` du test (le body déplié est l'état pertinent pour vérifier la présence du lien produit).
- **Files modified:** `session-no-ai-validator.test.tsx`
- **Committed in:** `2a827ea`

**2. [Rule 3 - Blocking] Retrait de la prop `canValidateAi` (devenue inutilisée)**
- **Found during:** Task 3
- **Issue:** Après retrait du validator, `canValidateAi` n'avait plus aucun usage → violation `noUnusedLocals` (tsc) côté StepCreation + prop morte passée par page.tsx.
- **Fix:** Prop retirée de l'interface `Props`, du destructuring `StepCreation`, et du call site `page.tsx`. `productAiDraftedAt` CONSERVÉ (badge lecture seule).
- **Files modified:** `step-creation.tsx`, `app/sessions/[id]/page.tsx`
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `2a827ea`

---

**Total deviations:** 2 auto-fixed (Rule 3, non-bloquantes). Aucune dérive de périmètre : retrait validation + outil zombies + NO-OP conformes au plan. Cible produit + moteur `dispatch-generate-doc`/`validateAiDraftProduct` intacts.

## Issues Encountered

- **Échec de test pré-existant HORS scope (inchangé)** : `src/lib/closure/__tests__/shared-template.test.ts` (Test 6, MIME `image/jpeg` vs `image/jpg`). Présent sur la baseline avant ce plan (constraint #7 + `deferred-items.md`), NON causé par ce plan, non corrigé. Suite : **1112 passés / 1 échec baseline** (1105 baseline + 7 nouveaux tests : 4 zombie + 3 session-no-ai-validator, tous verts).
- **Changements hors-plan pré-existants NON touchés** : l'arbre de travail contenait déjà des modifications non commitées sans lien (`produits/[id]/page.tsx`, `edit-product-button.tsx`, `session-location-picker.tsx`, `crud-edits.ts`, `tsconfig.tsbuildinfo`). Staging ciblé fichier par fichier — ces fichiers n'ont PAS été inclus dans les commits du plan.
- Filtre vitest `-- <pattern>` toujours inopérant via `pnpm test` → exécution ciblée via `pnpm --filter @qualiof/web exec vitest run <pattern>` (note Lots 1-3).

## Known Stubs

- Aucun. L'outil zombies est fonctionnel (DRY prouvé sur données réelles) ; le WRITE est un geste opérateur gaté, pas un stub. La validation IA reste pleinement fonctionnelle au produit.

## Tests de puissance (mutation) — prouvés au gate

1. **Prédicat zombie** : dans `close-zombie-batches.ts`, retrait de la garde « aucun job actif récent » (`return true` au lieu de `return !hasRecentActiveJob`) → cas 2 (batch avec job PROCESSING récent) **+** garde QUEUED récent virent **ROUGE** (2 échecs) → restauré → 4/4. Prouve que le prédicat protège réellement les batches actifs.
2. **Retrait validation session** : réintroduction du texte « Valider le programme » dans le badge programme → test 1 de `session-no-ai-validator` vire **ROUGE** → restauré → 3/3. Prouve que le test garde bien l'absence de validation sur la session.

## Acceptance greps

- `grep "export function isZombieBatch|finalStatusFor" close-zombie-batches.ts` OK ; `grep react/requireRole/validateRequest` = **0** ; import isolé node+tsx = 3 exports chargés.
- `grep WRITE|isZombieBatch scripts/close-zombie-batches.ts` OK ; `grep closure:close-zombies package.json` OK.
- `grep InlineAiDraftValidator apps/web/src` = **0** (composant supprimé) ; `grep InlineAiDraftValidator step-creation.tsx` = **0**.
- `test -f produits/ai-draft-validation-banner.tsx` = présent (cible intacte) ; `validateAiDraftProduct` toujours exporté.
- `grep produits/ session-no-ai-validator.test.tsx` OK (lien produit asserté).
- `grep sessionStage next-action-hero.tsx` = 1 ; `grep DocsButton|SessionCalendarSyncToggle session-header-bar.tsx` = **0**.
- `tsc --noEmit` : **0 erreur**. Suite : **1112 verts** (1 échec baseline hors scope).

## Checkpoint visuel (manuel, hors automatisé) — pour Laurent

Sur l'instance dev déjà en cours sur `:3010` (NE PAS relancer de serveur) :
1. `/app/sessions/<id>?tab=session` : plus AUCUN bouton « Valider le programme IA » ; le programme s'affiche en lecture seule avec, si brouillon IA, le badge « Brouillon IA — à valider sur la fiche produit » + lien « Éditer » vers la fiche produit.
2. En-tête : un seul rendu du tarif (« X € / stagiaire »), pas de doublon même en mode édition ; un seul CTA contextuel (issu de `sessionStage`).
3. Après le WRITE zombies (voir section dédiée) : plus aucun « pack en cours » fantôme sur les fiches SES-0042/0043/0044/0057.

## Next Phase Readiness

- Lot 4 livré : outil zombies (DRY prouvé, WRITE gaté), validation IA retirée de la session, correctifs NO-OP vérifiés. tsc + suite (hors baseline) verts.
- Phase 15 = 4/4 plans livrés. RESTE GATÉ : (a) WRITE zombies par Laurent (DRY→WRITE=1→re-DRY=0) ; (b) checkpoint visuel `:3010` avant `/gsd:verify-work`.

## Self-Check: PASSED

- Fichiers créés vérifiés présents : `close-zombie-batches.ts`, `close-zombie-batches.test.ts`, `scripts/close-zombie-batches.ts`, `session-no-ai-validator.test.tsx`, `15-04-SUMMARY.md`.
- Fichier supprimé vérifié absent : `inline-ai-draft-validator.tsx`.
- Commits vérifiés présents : `9812455` (test), `fcf165b` (feat), `e9c5364` (test), `2a827ea` (feat), `967ad09` (docs).

---
*Phase: 15-refonte-fiche-session-onglets*
*Completed: 2026-07-01*
