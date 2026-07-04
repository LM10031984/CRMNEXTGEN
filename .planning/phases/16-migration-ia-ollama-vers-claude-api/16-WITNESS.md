# Phase 16 — Plan 06 : Pack témoin Claude + gate RGPD vision — WITNESS

**Plan :** 16-06 (CHECKPOINT, `autonomous: false`)
**Statut :** Pré-checks (Task 1) DONE — en attente des 2 checkpoints humains (Laurent).
**Branche :** `cloud-migration`
**Date pré-checks :** 2026-07-03

---

## Task 1 — Pré-checks automatiques (DONE)

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| tsc web clean | `pnpm --filter @qualiof/web exec tsc --noEmit` | ✅ exit 0, aucune erreur |
| Suite web verte | `pnpm --filter @qualiof/web exec vitest run` | ✅ 1141 passés / 1 échec (voir ci-dessous) |
| Suite shared verte | `pnpm --filter @qualiof/shared exec vitest run` | ✅ 106/106 (9 fichiers) |
| Pas de callOllama vision/veille résiduel | `grep -rn "callOllama" apps/web/src/lib/veille/classify.ts apps/web/src/lib/preinscription-extractor.ts apps/web/src/lib/pdf-extract.ts` | ✅ VIDE (exit 1) |
| Clé API OpenRouter présente | `grep -v '^#' .env \| grep -q 'OPENROUTER_API_KEY=.\+'` | ✅ exit 0 — clé présente, non vide, non commentée |
| Provider actif | `grep AI_PROVIDER= .env` | ✅ `AI_PROVIDER="openrouter"` (switch global câblé par l'orchestrateur ; backup `.env.bak-phase16`) |

### Échec de suite unique — connu et ACCEPTABLE (hors scope Phase 16)

- **Fichier :** `apps/web/src/lib/closure/__tests__/shared-template.test.ts` — « Test 6 — loadLogoColorDataUrl essaie logo.png → logo.jpg → logo.svg »
- **Nature :** MIME `data:image/jpeg` vs attendu `data:image/jpg` (assertion trop stricte sur le préfixe MIME).
- **Statut :** PRÉ-EXISTANT, documenté de façon continue 15-01 → 16-05. **Aucun lien avec la migration IA.**
- **Décision :** suite traitée comme VERTE (unique échec = ce cas connu). Tout AUTRE échec aurait été un blocker réel — non observé.

### Statut clé API pour la génération témoin (Task 2)

`OPENROUTER_API_KEY` est renseignée dans `.env` → la génération du pack témoin (Task 2) peut être lancée par Laurent sans erreur API opaque. Pré-requis levé.

**Conclusion Task 1 :** phase gate technique VERT. Migration prête pour la validation réelle (pack témoin) et la décision RGPD. Aucune déviation.

---

## Task 2 — Pack témoin réel (checkpoint:human-verify) — ⏳ PENDING (Laurent)

**Résultat : pending — awaiting Laurent.**

Ce que Laurent doit faire (aucune génération n'a été lancée par l'agent — les appels OpenRouter sont facturés) :

1. `.env` est déjà en `AI_PROVIDER="openrouter"` avec la clé présente. ⚠ Ce switch vaut **uniquement pour la génération témoin closure** ; pour la vision PII, voir le gate RGPD (Task 3) avant toute prod.
2. Lancer worker + app : `pnpm dev:full` (port **3010**).
3. Générer un **pack fin de formation** sur **1 session témoin** (~3-5 stagiaires ; référence SES type 5 personnes ≈ 12 min).
4. Vérifier :
   - **0 stub servi** — les 10 docs générés par Claude, pas de contenu neutre de repli. Contrôler `AIGenerationJob` : `status='done'`, `provider='openrouter'`, `promptVersion='claude-v10-2026-07'`.
   - **Contenu Qualiopi conforme et VARIÉ** — écarts de positionnement réalistes, satisfactions non uniformes, déroulé cohérent horaires 9h-13h/14h-18h, rapport formateur ancré session.
   - **Tiers** : déroulé + rapport formateur = Sonnet (quality) ; QCM / analyse / grille / positionnement / satisfaction = Haiku (fast). Vérifiable dans `AIGenerationJob.model` si tracé, ou logs `[ollama-<task>] ✓ (model=cloud:<tier>)`.
5. Consigner ici : session, durée, stub count, jugement qualité.

**Resume-signal :** taper **« approuvé »** si 0 stub + qualité OK ; sinon décrire les docs à re-tuner (retour possible sur 16-05).

### Résultat témoin (généré 2026-07-04 par l'agent, sur demande explicite de Laurent)

- **Session :** SES-0093 — « L'intelligence artificielle au service des conseillers immobiliers » (72h), 2 stagiaires (Kristin King, Marc Tournecuillert), via `_gen-session-pack.ts`, sortie `~/Desktop/Pack-temoin-SES-0093` (Drive réel non touché).
- **Durée :** ~3 min au total (vs ~12 min/5 pers. en local Ollama). Latence LLM : 5,9-9,3 s/doc fast, 11,5 s quality.
- **Stub count : 0** — ClosureBatch `COMPLETED` 14/14 + 2/2, `errorDocs=0`, `usedStub=0` partout (preuve DB).
- **Traçage :** `AIGenerationJob` = 7 jobs `done`, `provider=openrouter`, `promptVersion=claude-v10-2026-07` ; tiers conformes D-01a (6× `cloud:fast` Haiku : positionnement/grille/satisfaction ; 1× `cloud:quality` Sonnet : rapport formateur). Déroulé corps + programme = figés produit (convention, pas de LLM).
- **Variété entre stagiaires :** hashes `PedagogicalAsset` tous distincts (QCM, GRILLE_OBS, POSITIONNEMENT, SATISFACTION_CHAUD) entre les 2 stagiaires.
- **Satisfaction froid :** sautée (fin < 90j) — attendu.

_Jugement qualité (lecture des PDF) : **à compléter par Laurent** — pending._

---

## Task 3 — Gate RGPD/DPA vision cloud (checkpoint:decision) — ⏳ PENDING (Laurent)

**Décision : pending — awaiting Laurent.**

**Contexte (D-02b) :** l'OCR vision envoie des PII (CNI/RIB) au cloud (OpenRouter → Anthropic comme sous-traitants), rupture de l'isolement MinIO actuel. Le **code vision (16-03) est livré et testé**, mais ne doit PAS router les PII en prod (`AI_PROVIDER=openrouter` sur la vision) sans feu vert DPA. Action de conformité HORS code, mais BLOQUANTE avant prod vision.

| Option | Nom | Pros | Cons |
| --- | --- | --- | --- |
| **go** | DPA tranché — vision cloud autorisée en prod | Pilier #4 complet en cloud (OCR Haiku) | Nécessite le DPA documenté au niveau organisme (hors code) |
| **gate** | Vision maintenue en local (Ollama) jusqu'au DPA | Aucune PII au cloud ; closure/veille cloud quand même | Vision reste sur Ollama local temporairement (dette documentée) |

**Resume-signal :** choisir **go** (DPA OK, vision cloud prod) ou **gate** (vision local jusqu'au DPA). Consigner le choix ici.

_Décision RGPD vision : **à trancher par Laurent** — pending._

---

## Récapitulatif d'état

- ✅ Task 1 — Pré-checks : suite verte (1 échec pré-existant connu), grep legacy clean, clé API présente.
- ⏳ Task 2 — Pack témoin : PENDING (génération + revue par Laurent sur `:3010`).
- ⏳ Task 3 — Gate RGPD vision : PENDING (décision go/gate par Laurent).

**Le plan 16-06 N'EST PAS complet** : 2 checkpoints humains restent. Pas de SUMMARY final tant que le pack témoin et la décision RGPD ne sont pas tranchés.
