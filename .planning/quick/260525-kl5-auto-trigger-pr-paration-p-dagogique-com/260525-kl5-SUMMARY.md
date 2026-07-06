---
phase: 260525-kl5
plan: 01
subsystem: sessions/preparation-pedagogique
tags: [quick, ux, automation, sessions, qualiopi]
requires: [createSessionFull, generateProgrammeForProduct, generateDerouleForProduct, generateChecklistForSession, generateConventionForParticipant, generateConvocationForParticipant, enqueueClosureJob]
provides: [prepareSession, getSessionPreparationStatus, PreparationPedagogiqueBlock]
affects: [session_detail_page, session_creation_flow]
tech_stack:
  added: []
  patterns:
    - fire-and-forget post-transaction
    - server-action idempotente find-or-create
    - useTransition + sonner pour CTA mutation
    - polling 5s state local (au lieu de router.refresh) pour ne pas rerender la page
key_files:
  created:
    - apps/web/src/components/sessions/preparation-pedagogique-block.tsx
  modified:
    - apps/web/src/server/actions/prepare-training.ts
    - apps/web/src/server/actions/sessions-create.ts
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/components/sessions/session-actions-menu.tsx
  deleted:
    - apps/web/src/components/sessions/prepare-training-button.tsx
decisions:
  - "Hook fire-and-forget post-transaction (vs await bloquant) : la session reste créée instantanément côté UX, la préparation tourne en arrière-plan. `void prepareSession(...)` avec `.catch` log warning si auth context perdu."
  - "Mini-batch BullMQ uniquement pour ANALYSE_BESOIN (IA Ollama lourde), pas pour les 5 generators sync : programme/déroulé/checklist/convention/convocation sont déjà rapides (~1-3s) et leur idempotence find-or-create fait le job."
  - "getSessionPreparationStatus dédié (3 queries bulk) pour piloter le polling 5s côté UI sans refaire un render serveur complet (router.refresh aurait rerender toute la page session)."
  - "AuditLog 'session.prepare' sur entity 'TrainingSession' (convention cohérente avec sessions.update existant)."
  - "PreparationPedagogiqueBlock = 3 états (vide/partiel/complet) auto-déduits côté client à partir du status (pas de prop redondante). CTA primaire bleu si vide, secondaire si partiel, badge vert si complet."
  - "Pas de `requireRole` dans prepareSession (appelée fire-and-forget post-création où le contexte d'auth peut disparaître). Bail out silencieux si pas d'user. La sécurité reste assurée par `canWrite` côté UI (côté layout app, l'utilisateur est forcément authentifié)."
metrics:
  duration_seconds: 302
  completed_at: 2026-05-25T13:01:49Z
  commits: 3
  files_created: 1
  files_modified: 4
  files_deleted: 1
---

# Quick task 260525-kl5 : Auto-trigger préparation pédagogique complète

## One-liner

Création de session → 6 catégories de docs Qualiopi auto-générées (programme + déroulé + checklist + convention/convocation/analyse besoin par stagiaire), bloc UI agrégé avec auto-refresh remplace l'ancien bouton "Préparer la formation".

## Tasks

| # | Task | Commit |
| --- | --- | --- |
| 1 | Add idempotent `prepareSession` + `getSessionPreparationStatus` server actions | `e28a0c6` |
| 2 | Hook `prepareSession` fire-and-forget dans `createSessionFull` | `4ed5799` |
| 3 | Replace `PrepareTrainingButton` by `PreparationPedagogiqueBlock` + page integration | `261bf93` |

## Décisions techniques

### 1. Fire-and-forget vs await bloquant
**Choix :** `void prepareSession(session.created.id).catch(log)` après le `await prisma.$transaction(...)`.
**Pourquoi :** la préparation contient 5 generators sync (~2-15s cumulés selon ProductMd + checklist) + 1 enqueue BullMQ. Bloquer la création serait perçu comme un lag UX. Le retour `{ ok: true, sessionId }` est instantané et la fiche session se charge déjà avec une partie des docs prêts (programme + checklist quasi instantanés).

### 2. Batch BullMQ uniquement pour ANALYSE_BESOIN
**Choix :** seul l'analyse besoin (IA Ollama lourde, ~30-60s/participant) passe par `ClosureBatch + ClosureJob` enqueue. Les 5 autres restent sync.
**Pourquoi :** créer un batch + 5 jobs pour Programme/Déroulé/Checklist/Convention/Convocation ajouterait de la complexité (worker→Document write race) pour des gains nuls (les generators sont déjà rapides et idempotents). Réutilisation directe du pattern `closure-pack.ts` lignes 257-282.

### 3. Polling local plutôt que `router.refresh`
**Choix :** `setInterval → getSessionPreparationStatus(sessionId) → setStatus(fresh)` au lieu de `router.refresh()`.
**Pourquoi :** la fiche session contient ~15 sections lourdes (matrice docs, trésorerie, factures, satisfactions, tasks). Un rerender serveur toutes les 5s pour mettre à jour 1 ligne "Analyse besoin (X/N)" serait gaspilleur. La server action retourne ~300 octets de JSON.

### 4. Idempotence à 3 niveaux
- **Documents** : `generateXxxForXxx` font tous un `findFirst` sur `(type, entityType, entityId)` ou `hashSha256` avant de générer → no-op si déjà OK.
- **ClosureBatch** : avant `create`, `prisma.pedagogicalAsset.findMany({ kind: 'ANALYSE_BESOIN', pdfUrl: not null })` puis filtrage `toEnqueue = participants.filter(!doneIds.has)` → batch créé uniquement avec les participants restants.
- **BullMQ** : `enqueueClosureJob` passe `jobId: payload.jobId` → BullMQ dédoublonne au niveau Redis si replay.

### 5. AuditLog `session.prepare`
Action retenue : `'session.prepare'` sur `entity='TrainingSession'`, `entityId=sessionId`, `diff` = compteurs (programmesGenerated, conventionsGenerated, analyseBesoinEnqueued, errors). Convention cohérente avec `sessions.update` déjà présent dans `sessions.ts` ligne 1101. Try/catch défensif autour pour ne pas faire planter la préparation si écriture audit échoue (cas edge `user.id` invalide).

## Pitfalls rencontrés

### Pitfall 1 — `validateRequest()` en fire-and-forget
**Risque :** Next.js peut garbage-collect le contexte cookies après que la server action `createSessionFull` retourne, donc `prepareSession` (appelée par `void`) peut se retrouver sans user. Si on faisait `requireRole(['ADMIN', ...])`, ça throw → catch silencieux dans le `.catch` du `void`.
**Solution :** `validateRequest()` (qui retourne `{ user: null }` sans throw) + bail out propre `return { ok: false, error: 'Non authentifié' }`. La fiche session affiche alors un état "vide" avec CTA "Lancer la préparation" si Laurent revient sur la page (et là, le clic sur le bouton recharge le contexte auth normalement).

### Pitfall 2 — RBAC côté serveur vs UI
**Question :** doit-on `requireRole` dans `prepareSession` quand appelée depuis le bouton "Compléter" ?
**Réponse :** non — feedback Laurent (`feedback_aller_droit_au_but`, `feedback_questions_metier_laurent`). Le layout `/app/*` garantit déjà un user authentifié + tenant. `canWrite` filtre côté UI (CTA disabled si pas ADMIN/MANAGER/COMMERCIAL). Ajouter `requireRole` reproduirait du code défensif que CLAUDE.md proscrit.

### Pitfall 3 — `entityType` lowercase pour Documents
La schema Document utilise `entityType: 'product' | 'session' | 'participant'` (lowercase singulier), pas `'TrainingProduct'`. J'ai dû corriger `getSessionPreparationStatus` après lecture des autres generators. AuditLog utilise par contre `entity: 'TrainingSession'` (PascalCase, modèle Prisma) — convention différente, suit le pattern existant dans `sessions.ts`.

### Pitfall 4 — `Promise.allSettled` au lieu de `Promise.all`
Pour les 3 generators produit/session, j'utilise `allSettled` : si l'un échoue (ex: déroulé Ollama timeout), les autres se terminent quand même. Sans ça, un rejet propage et annule les autres. `Promise.allSettled` impose une discrimination `status === 'fulfilled' ? value : reason` à la lecture, mais c'est le bon trade-off ici (fail isolé).

## Auth gates

Aucun.

## Validation manuelle attendue

Laurent valide en créant une session test après `pnpm dev:full` :

1. `pnpm dev:full` (auto-clean `.next` inclus).
2. Wizard → créer une session avec 2-3 apprenants.
3. Observer la fiche session :
   - **Header** : plus de bouton "Préparer la formation" — seuls subsistent "Éditer", "📦 Pack fin de formation" (toujours visible), kebab.
   - **Section "Préparation pédagogique"** entre `SessionOnlyDocsBlock` et la matrice participants :
     - 3 lignes col gauche (Programme / Déroulé / Checklist) avec ✓ verts au fur et à mesure.
     - 3 lignes col droite (Convention X/N / Convocation X/N / Analyse besoin X/N avec spinner).
     - CTA contextuel : "Lancer la préparation" → "Compléter (X manquants)" → badge vert "✓ Préparation complète".
4. Recharger la page : `getSessionPreparationStatus` reflète l'état BDD (les Documents/PedagogicalAsset déjà créés).
5. Cliquer "Compléter" sur une session partielle : ne refait rien si tout existe (toast OK), génère les manquants sinon.

## Backlog hors-scope

- **Bug G IMAGIMO Drive** (mentionné dans le plan output) : non touché, aucun fichier lié visible dans le scope.
- **AGEFICE auto-trigger** (mentionné dans le plan output) : la génération AGEFICE n'est pas déclenchée par `prepareSession` — c'est cohérent avec le scope "pré-formation" (AGEFICE = dossier OPCO, autre cycle). Pourrait être ajouté dans une quick task séparée si Laurent veut aussi auto-déclencher la fiche AGEFICE à la création des participants AGEFICE.
- **PrepareTrainingResult.prepareTrainingForSession** : conservé en export pour backward-compat éventuel, mais zéro caller post-cleanup (grep `prepareTrainingForSession` apps/web/src retourne uniquement le déclarant). Pourrait être supprimé dans une future quick task de cleanup.

## Self-Check: PASSED

- File `apps/web/src/server/actions/prepare-training.ts` modified — verified
- File `apps/web/src/server/actions/sessions-create.ts` modified — verified
- File `apps/web/src/components/sessions/preparation-pedagogique-block.tsx` created — verified
- File `apps/web/src/app/app/sessions/[id]/page.tsx` modified — verified
- File `apps/web/src/components/sessions/prepare-training-button.tsx` deleted — verified (FILE_DELETED_OK)
- Commit `e28a0c6` exists — verified
- Commit `4ed5799` exists — verified
- Commit `261bf93` exists — verified
- `tsc --noEmit` clean — verified
- `grep PrepareTrainingButton` returns 0 — verified
