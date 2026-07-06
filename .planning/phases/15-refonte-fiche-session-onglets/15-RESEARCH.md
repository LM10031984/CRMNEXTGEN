# Phase 15: Refonte fiche session en 5 onglets - Research

**Researched:** 2026-06-26
**Domain:** Next.js 14.2 App Router (RSC + Server Actions) — réorganisation UI d'une page existante de 1069 lignes, sans toucher au câblage métier.
**Confidence:** HIGH (tout vérifié sur le code source local : chemins + lignes cités)

## Summary

C'est une **réorganisation de surface**, pas une reconstruction. La page `apps/web/src/app/app/sessions/[id]/page.tsx` (1069 lignes) fait déjà TOUTES les requêtes serveur et passe des slots/props à une vingtaine de composants. Le travail consiste à : (1) introduire un conteneur à onglets `?tab=` qui REDISTRIBUE les composants déjà rendus dans 5 zones, (2) supprimer 3 surfaces redondantes (`SessionOnlyDocsBlock`, `DocDockDrawer` + `DocsButton`), (3) déplacer la validation programme IA — **qui existe DÉJÀ au niveau produit**, (4) nettoyer les batches zombies — **un script précédent existe DÉJÀ** (`requeue-stuck-closure-jobs.ts`).

Deux découvertes majeures réduisent fortement le risque : **(A)** la validation IA produit est déjà entièrement implémentée (`AiDraftValidationBanner` + `ProductProgrammeTab` + `validateAiDraftProduct`) — Lot 4 « déplacer au produit » = surtout RETIRER l'`InlineAiDraftValidator` de la session, pas le recréer. **(B)** Les 4 docs niveau session (Déroulé, Grille obs, Checklist, Bilan satisfaction) ont DÉJÀ chacun un chemin de génération à l'unité, câblé dans `SessionOnlyDocsBlock` — il faut les **réembarquer** dans l'onglet « Après », pas les créer.

**Le seul risque réel = la perte d'actions uniques au `DocDockDrawer`.** Le drawer est le **seul** consommateur de `dispatchGenerateDoc`/`dispatchGenerateMissing` (vérifié par grep : 0 autre usage). Avant de supprimer le drawer, il faut soit réembarquer son bouton « Tout générer » et ses lignes « clic génère ce doc » dans l'onglet « Avant », soit garder ces deux server actions et les recâbler. C'est le point d'attention #1 du plan.

**Primary recommendation:** Onglets = conteneur **client** lisant `?tab=` via `useSearchParams()`, recevant les 5 sections **pré-rendues en props/children** depuis la page RSC (qui garde ses requêtes), navigation par `window.history.pushState` pour switcher sans round-trip serveur, et `<Link href="?tab=">` en fallback deep-link. C'est le compromis « pas de refetch au switch » + « survit au `router.refresh()` ».

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Structure : 5 onglets (LOCKED)** — Onglet actif dans l'URL (`?tab=`) pour deep-link + survie au `router.refresh()`. Onglet par défaut = **Session**.
1. **Session** — produit (lecture seule + lien fiche produit), dates, lieu, formateur, statut, inscription des apprenants (liste nominative + CFP/CNI/RIB → budget AGEFICE → seed analyse besoin). CTA : « Inscrire un apprenant ».
2. **Avant la formation** — Convention/contrat (+CGV, devis) · AGEFICE (par stagiaire éligible) · Analyse de besoins (par stagiaire) · Convocation (par stagiaire). CTA : « Tout générer ».
3. **Après la formation** (le pack, « Pendant » fondu ici) — Attestation · Bilan formateur · Certificat · Assiduité/émargement · Satisfaction chaud · Satisfaction froid · Positionnement · (niveau session) Grille d'observation session + Bilan satisfaction session. CTA : « Générer le pack ». Suivi batch DANS cet onglet (plus de bandeau flottant).
4. **Tous les documents** — vue LECTURE SEULE : `ParticipantDocMatrix` plein écran + filtres + « Télécharger le ZIP ». PAS une 2ᵉ source d'action.
5. **Agenda** — synchro Google Calendar (Phase 14, idempotent) + affichage créneaux en lecture. Créneaux éditables = hors phase.

**Règles non négociables (LOCKED) :**
- **1 doc = 1 maison** : chaque document vit dans l'onglet de son moment et nulle part ailleurs.
- **Source unique d'état** : tous les onglets lisent le même `getSessionCompleteness`/`sessionStage`. Zéro désync.
- **En-tête persistant = identité + statut + 1 CTA contextuel + bouton Paramètres** (allégé, au-dessus des onglets).
- **Le programme quitte la session** : « Valider le programme IA » se gère au niveau PRODUIT.
- **Génération sur donnée prête, pas sur navigation** : statut par doc visible, idempotent.
- **Invalidation à l'édition** : pattern `updatedAt`/`PROMPT_VERSION`. Navigation libre (pas wizard verrouillé).
- **Lisibilité** : une ligne par doc, statut + action claire (fini les cartes 4-colonnes `text-[11px]`).
- **Réutiliser l'existant** : réembarquer les blocs d'étape, l'édition inline, `normalizeNullableText`.

**Surfaces à SUPPRIMER (LOCKED, après vérif « aucune action unique perdue ») :**
- `SessionOnlyDocsBlock` (4 cartes minuscules)
- `DocDockDrawer` + `DocsButton`
- Lignes docs dupliquées dans `PreparationPedagogiqueBlock`, `ClosureFormationBlock`
- **Pré-condition impérative** : avant toute suppression, vérifier qu'aucune action ne vit UNIQUEMENT dans le drawer.

**Découpage en 4 lots** : Lot 1 coquille onglets + en-tête · Lot 2 réembarquer + supprimer doublons · Lot 3 onglet Agenda · Lot 4 programme au produit + nettoyage batches zombies + correctifs visuels (CTA `NextActionHero`, doublon tarif en-tête).

### Claude's Discretion
- Mécanique exacte du conteneur à onglets (client recevant sections pré-rendues en props vs nested routes — privilégier le plus simple sans refetch au switch).
- Structure de fichiers des nouveaux composants d'onglet.
- Forme exacte de l'outil de nettoyage des batches zombies (script tsx vs server action admin).
- Stratégie de tests Vitest par lot.

### Deferred Ideas (OUT OF SCOPE)
- Facturation (`StepFacturation`) et Évaluation/stats (`SessionEvaluationBlock`) — sortis du flux principal.
- Conformité audit T1-T13 + bandeau « prêt pour audit » + blockers IA + rails handicap/amélioration/sous-traitants (annexe §8.1/§8.3).
- Dette Lot E (annexe §8.2) : E0 transition VALIDATED→IN_PROGRESS, E-tech-1 tsc redirect-308, E-data-1..5.
- Créneaux agenda éditables interactifs (SessionSlot).
</user_constraints>

## Project Constraints (from CLAUDE.md)

Directives actionnables extraites du `CLAUDE.md` racine (autorité = locked) :
- **Server Actions over /api pour les mutations** ; pattern de retour discriminé `{ ok, ... }` / `{ ok: false, error }`.
- **Zod schemas dans `packages/shared/src/schemas/`**, réutilisés serveur + client.
- **Toute requête Prisma scopée `user.tenantId`** ; toute nouvelle server action DOIT scope par tenantId.
- **Routes FR kebab-case** ; toujours ajouter un **redirect 308** dans `apps/web/next.config.mjs` pour les variantes naturelles. (Ici : aucune nouvelle route — onglets en `?tab=`, donc PAS de nouvelle entrée nav ni redirect requis. La route `/app/sessions/[id]` est inchangée.)
- **Worker BullMQ : aucun import auth/React** (`requireRole`, `validateRequest`, `from 'react'`) dans le code worker-safe — sinon crash `react does not provide an export named 'cache'` au boot. Concerne uniquement si on touche `lib/closure/*` (Lot 4 nettoyage).
- **Footer PDF** en HTML body `position:fixed bottom:0` — ne pas régresser (hors scope ici, aucun template touché).
- **Money** : `pricePerLearner` rendu via `Intl.NumberFormat('fr-FR', currency)`. Ne pas dupliquer le suffixe (cf. Pitfall tarif).
- **Tests** : Vitest, test comportemental par couche, baseline non-nulle (test de puissance / mutation au gate), orphelins stashés.
- **GSD workflow** : un commit par tâche, gates séquentielles.

<phase_requirements>
## Phase Requirements

Cette phase n'a **pas** d'IDs de requirements formels dans `REQUIREMENTS.md` (Phase 15 ajoutée le 2026-06-26 via roadmap evolution, source de vérité = `PLAN-FICHE-SESSION-ONGLETS-RECAP.md`). Le plan source §7 fixe ce que Claude doit rendre avant de coder ; cette recherche répond aux 3 livrables exigés :

| Livrable plan source §7 | Réponse research |
|---|---|
| Liste composants réembarqués vs supprimés + vérif « aucune action unique perdue » | § *Architecture Patterns > Inventaire RÉUTILISER/SUPPRIMER* + § *Don't Hand-Roll > Actions uniques au DocDockDrawer* |
| Confirmation chemin génération docs niveau session (Grille obs, Bilan satisfaction) | § *Standard Stack > Docs niveau session* — **les 4 existent déjà** |
| ROADMAP GSD séquence de commits Lot 1→4 | Cadré par CONTEXT (4 lots LOCKED) ; § *Validation Architecture* donne les gates par lot |
</phase_requirements>

## Standard Stack

Aucune nouvelle dépendance. Tout est déjà présent et figé (cf. CLAUDE.md > Out of Scope : pas de migration Next 15, pas de refonte design system).

### Briques réutilisées (vérifiées présentes)
| Brique | Chemin | Rôle dans la refonte |
|---|---|---|
| `ProductTabs` (précédent onglets) | `apps/web/src/components/produits/tabs/product-tabs.tsx` | **Modèle de référence** : `?tab=` + `<Link>` + `role=tablist`. À cloner/adapter pour la session. |
| `LearnerTabs` (précédent onglets) | `apps/web/src/components/apprenants/learner-tabs.tsx` | 2ᵉ précédent `?tab=` avec badges. Pattern `params.delete('tab')` pour le tab par défaut. |
| `getSessionCompleteness` (source état) | `apps/web/src/lib/sessions/completeness.ts` | Source unique, ne PAS dupliquer. |
| `sessionStage` (source état) | `apps/web/src/lib/sessions/session-stage.ts` | Source unique CTA + étape courante (déjà lue par header + hero + timeline). |
| `docCompletion` (source compteurs) | `apps/web/src/lib/sessions/doc-completion.ts` | Source unique « X manquants », partagée drawer + steps. |
| `getSessionClosureStatus` (état pack) | `apps/web/src/server/actions/closure-status.ts` | Lit `grilleObsSession`/`bilanSatisfaction`/`latestBatchStatus`. |

### Docs niveau session — CONFIRMÉ : génération à l'unité existe déjà (Q3)

Les 4 docs « niveau session » ont chacun une server action de génération à l'unité, câblées dans `SessionOnlyDocsBlock` (lignes 25-28, 115-133) :

| Doc | Server action | Chemin | Idempotence | Réponse |
|---|---|---|---|---|
| Déroulé pédagogique | `generateDerouleForProduct(productId, {force})` | `server/actions/deroule-product-generator.ts` | find-or-create | ✅ existe |
| **Grille d'observation session (ind. 11)** | `generateGrilleObsSessionForSession(sessionId, {force})` | `server/actions/generate-grille-obs-session.ts:31` | find-or-create `Document type=GRILLE_OBS_SESSION` (L39-52) | ✅ existe |
| Checklist formation (ind. 17) | `generateChecklistForSession(sessionId, {force})` | `server/actions/generate-checklist-formation.ts:22` | core idempotent | ✅ existe |
| **Bilan satisfaction session (ind. 30)** | `generateSatisfactionSessionForSession(sessionId)` | `server/actions/generate-satisfaction-session.ts:16` | déterministe (re-génère systématiquement, **pas de `force`**) | ✅ existe |

**Conclusion Q3 :** le « trou des X manquants » n'est PAS un trou de génération — les 4 chemins existent et couvrent les docs manquants. Le vrai problème = ces actions vivent dans `SessionOnlyDocsBlock` (à supprimer) et dans `dispatchGenerateDoc` (drawer, à supprimer). **Action plan : réembarquer ces 4 boutons unitaires dans l'onglet « Après »** (une ligne par doc, lisible), pas les recréer. Détection d'état déjà fournie par `getSessionClosureStatus` (`grilleObsSession`, `bilanSatisfaction` — `closure-status.ts:160-161`). Note : la grille obs a une subtilité — la matrice la considère présente dès qu'un `PedagogicalAsset.kind='GRILLE_OBS'` existe par participant (`grilleObsAssetCount`, page L311) ; conserver ce proxy pour cohérence visuelle.

### Validation programme IA au niveau produit — CONFIRMÉ : déjà implémentée (Q5)

| Élément | Chemin | État |
|---|---|---|
| Fiche produit | `apps/web/src/app/app/produits/[id]/page.tsx` | Onglets `?tab=stats\|sessions\|apprenants\|programme\|docs` |
| Bannière validation IA produit | `apps/web/src/components/produits/ai-draft-validation-banner.tsx` (`AiDraftValidationBanner`) | **Existe** : « Valider le programme » + « Réviser » |
| Affichage dans le tab Programme | `apps/web/src/components/produits/tabs/product-programme-tab.tsx:63-69` | **Déjà rendu** si `aiDraftedAt` non null, garde `canValidateAiDraft` (ADMIN/MANAGER) |
| Server action | `validateAiDraftProduct(productId)` dans `server/actions/crud-edits.ts` | **Existe** (met `aiDraftedAt = null`) |
| État `aiDraftedAt` montré côté produit | `produits/[id]/page.tsx:229` passe `aiDraftedAt={product.aiDraftedAt}` au tab | **Existe** |
| **Doublon session à RETIRER** | `apps/web/src/components/sessions/inline-ai-draft-validator.tsx` (`InlineAiDraftValidator`) | rendu dans `step-creation.tsx` ; importé par page `StepCreation` (prop `canValidateAi`, `productAiDraftedAt`) |

**Conclusion Q5 :** Lot 4 « déplacer au produit » = surtout un **retrait**. La cible (produit) existe déjà. Travail réel : (1) retirer le rendu de `InlineAiDraftValidator` depuis `step-creation.tsx` / l'onglet Session ; (2) sur la session, programme en lecture seule + lien `/app/produits/{id}?tab=programme` (le lien existe déjà dans `inline-ai-draft-validator.tsx:101-108` et `ai-draft-validation-banner.tsx:97-102`). `validateAiDraftProduct` + `inline-ai-draft-validator.tsx` deviennent supprimables APRÈS retrait du dernier usage session (le validator inline n'est plus appelé ailleurs).

**Installation :** aucune.
**Version verification :** Next.js `14.2.21`, React `18.3.1`, Prisma `5.22.0` (lus dans STACK.md, figés). Pas de `npm view` requis (aucun ajout).

## Architecture Patterns

### Inventaire RÉUTILISER vs SUPPRIMER (Q1)

Tout ce que rend `sessions/[id]/page.tsx` aujourd'hui, et sa destination dans les 5 onglets. (`L` = ligne de rendu dans `page.tsx`.)

| Composant rendu | Fichier | Destination onglet | Action |
|---|---|---|---|
| `SessionHeaderBar` (L534) | `session-header-bar.tsx` | **En-tête persistant** (au-dessus des onglets) | RÉUTILISER, allégé (cf. Pitfall barre 6 boutons) |
| `NextActionHero` (L821) | `next-action-hero.tsx` | **En-tête persistant** ou onglet Session | RÉUTILISER (1 CTA contextuel) |
| `SessionStatusSelect` + `SessionDatesEditor` (L840-845) | `session-status-select.tsx`, `session-dates-editor.tsx` | **Session** | RÉUTILISER |
| `BatchProgressAutoRefresh` (L850) | `batch-progress-auto-refresh.tsx` | **Après** (suivi pack DANS l'onglet, plus page-wide) | RÉUTILISER, déplacer |
| `SessionWorkflowTimeline` (wrapper, L877) | `session-workflow-timeline.tsx` | éclatée par onglet | À DÉCOMPOSER (le wrapper « timeline 5 étapes » disparaît, ses steps migrent) |
| `StepCreation` (L888) | `step-creation.tsx` | **Session** | RÉUTILISER ; RETIRER l'`InlineAiDraftValidator` interne (Q5) |
| `SessionParticipantsList` (L940) | `session-participants-list.tsx` | **Session** | RÉUTILISER |
| `PreparationPedagogiqueBlock` (L954) | `preparation-pedagogique-block.tsx` | **Avant** | RÉUTILISER ; retirer lignes docs dupliquées |
| `StepPendantFormation` (L966) | `step-pendant-formation.tsx` | **Après** (« Pendant » fondu) | RÉUTILISER, fusionner |
| `ClosureFormationBlock` (L978) | `closure-formation-block.tsx` | **Après** | RÉUTILISER ; retirer lignes docs dupliquées |
| `SessionEvaluationBlock` (L988) | `session-evaluation-block.tsx` | **HORS SCOPE (déféré)** | SORTIR du flux principal |
| `StepFacturation` (L991) | `step-facturation.tsx` | **HORS SCOPE (déféré)** | SORTIR du flux principal |
| `SessionOnlyDocsBlock` (L1015) | `qualiopi-matrix/session-only-docs-block.tsx` | — | **SUPPRIMER** (ses 4 actions unitaires réembarquées dans « Après ») |
| `ParticipantDocMatrix` (L1052, dans `<details>`) | `qualiopi-matrix/participant-doc-matrix.tsx` | **Tous les documents** (plein écran, lecture seule) | RÉUTILISER, promouvoir |
| `DocsButton` + `DocDockDrawer` (L585) | `docs-button.tsx`, `doc-dock-drawer.tsx` | — | **SUPPRIMER** (cf. Q2, condition impérative) |
| `SettingsButton` + `SettingsDrawerSection` (L602-749) | `settings-button.tsx`, `settings-drawer.tsx` | **En-tête > Paramètres** | RÉUTILISER (formateurs/lieu/logistique/notes/satisfaction/tasks/agenda) |
| `SessionCalendarSyncToggle` (L594, L725) | `session-calendar-sync-toggle.tsx` | **Agenda** (+ retirer le doublon header) | RÉUTILISER, déplacer dans l'onglet Agenda |
| `GenerateClosurePackButton` (L760, L782, L826) | `generate-closure-pack-button.tsx` | **Après** (CTA « Générer le pack ») | RÉUTILISER ; supprimer les rendus multiples redondants |
| `MarkCompletedButton` (L766) | `mark-completed-button.tsx` | **En-tête** ou **Session** | RÉUTILISER |
| `SessionActionsMenu` + Duplicate/Delete (L802) | `session-actions-menu.tsx` | **En-tête kebab** | RÉUTILISER |
| `EditSessionDetailsDialog` (L568, L909) | `edit-session-details-dialog.tsx` | **Session** + En-tête | RÉUTILISER (dédupliquer : rendu 2× aujourd'hui) |
| `AddParticipantDialog` (L926) | `add-participant-dialog.tsx` | **Session** | RÉUTILISER |
| inline editors (`SessionTitleInline`, `SessionPriceInline`, `SessionNotesInline`) | `session-*-inline.tsx` | En-tête / Session / Paramètres | RÉUTILISER |
| `SessionCompletenessBadge` (L562) | `session-completeness-badge.tsx` | En-tête | RÉUTILISER |
| `RecordRecentVisit` (L524) | `command-palette/record-recent-visit.tsx` | hors onglets (page-level) | RÉUTILISER |
| `<details id="section-doc-matrix">` (L1044) | inline page | remplacé par onglet « Tous les documents » | SUPPRIMER le wrapper `<details>` |
| `TresoStatusBlock`, `SessionInvoicesBlock` | présents dans `components/sessions/` mais **PAS rendus** par page.tsx | — | déjà hors-flux (laisser) |

### Pattern onglets recommandé (Q4) — conteneur client + sections pré-rendues en props

**Contexte technique vérifié.** La page session est un `async` Server Component qui exécute ~10 requêtes Prisma (lignes 68-453) + 3 server actions (`getSessionPreparationStatus` L415, `getSessionClosureStatus` L416, `getSessionEvaluationStats` L417). Le précédent repo (`ProductTabs`) navigue par `<Link href="?tab=X">`, ce qui **re-exécute le Server Component complet à chaque switch d'onglet** (round-trip serveur + refetch). Vérifié via Context7 (Next 14 App Router) : changer un `searchParam` via `<Link>`/`router.push` ré-rend le RSC ; seul `window.history.pushState` met à jour l'URL **sans** round-trip.

Le produit s'en sort car il **lazy-load par tab** (ne fetch que les data du tab actif, `produits/[id]/page.tsx:102-123`). La session ne peut pas adopter ça simplement : elle fait déjà toutes les requêtes en haut, et l'en-tête + plusieurs onglets partagent les mêmes données dérivées (`stage`, `sessionCompleteness`, maps docs).

**3 options évaluées :**

| Approche | Refetch au switch ? | Survit `router.refresh()` ? | Deep-link ? | Complexité | Verdict |
|---|---|---|---|---|---|
| **A. Nested routes** `[id]/avant/page.tsx` etc. | Oui (refetch + re-render layout) | Oui | Oui | Haute (5 pages, layout partagé, dupli requêtes ou layout fetch) | ❌ trop lourd pour « réorganisation de surface » |
| **B. searchParams RSC** (clone `ProductTabs`, `<Link href="?tab=">`) | **Oui — refetch des ~10 requêtes à CHAQUE clic d'onglet** | Oui | Oui | Faible | ⚠️ simple mais lent (la page est lourde) |
| **C. Conteneur client, sections pré-rendues en props, `pushState`** | **Non** (sections déjà en mémoire client) | Oui (sections re-rendues par le refresh, onglet préservé via `?tab=` lu côté client) | Oui (init depuis `searchParams` serveur + `useSearchParams` client) | Moyenne | ✅ **RECOMMANDÉ** |

**Approche C — détail :**
1. La page RSC garde toutes ses requêtes (inchangé). Elle rend **toujours les 5 sections** et les passe en `children`/slots à un composant client `<SessionTabs>` :
   ```tsx
   <SessionTabs
     defaultTab={coerceTab(sp.tab)}
     session={<SessionTabContent .../>}
     avant={<AvantTabContent .../>}
     apres={<ApresTabContent .../>}
     docs={<TousDocsTabContent .../>}
     agenda={<AgendaTabContent .../>}
   />
   ```
2. `<SessionTabs>` (`'use client'`) lit l'onglet actif via `useSearchParams().get('tab') ?? 'session'`, affiche la section active, masque les autres (`hidden`, pas démonté — elles restent montées pour switch instantané). Switch = `window.history.pushState(null, '', '?tab=X')` → **0 round-trip, 0 refetch**, URL deep-linkable.
3. `router.refresh()` (déclenché par les générations de docs via `revalidatePath`) ré-exécute le RSC → re-rend les 5 sections avec données fraîches ; l'onglet actif est conservé car lu depuis `?tab=` (présent dans l'URL).
4. Fallback deep-link / SEO / sans-JS : la page RSC lit `sp.tab` pour rendre l'onglet initial actif côté serveur (cohérent avec `ProductTabs`).

**Implications `router.refresh()`** (déclenché par toutes les générations : `SessionOnlyDocsBlock`→`router.refresh()`, drawer `handleGenerate`→`router.refresh()`) : avec C, le refresh re-fetch les données serveur mais le composant client `<SessionTabs>` préserve l'onglet via l'URL. Pas de saut vers l'onglet par défaut. Garde-fou de `SessionPriceInline` (« source unique vaut aussi à l'écriture », `session-price-inline.tsx:8`) respecté.

**Pourquoi pas B (le plus simple) :** sur une page à ~10 requêtes + 3 server actions, un refetch complet à chaque clic d'onglet = latence visible + charge Ollama/Postgres inutile. Le plan source impose « navigation fluide ». C donne le switch instantané. Si le planner veut minimiser le risque sur Lot 1, B est acceptable comme coquille initiale, **mais** migrer vers C avant Lot 2 (réembarquement) sous peine de dégrader l'UX que la refonte vise à améliorer.

### Recommended structure des nouveaux composants
```
apps/web/src/components/sessions/tabs/
├── session-tabs.tsx          # 'use client' — conteneur, ?tab=, pushState, role=tablist
├── tab-session.tsx           # (server) StepCreation + SessionParticipantsList + status/dates
├── tab-avant.tsx             # (server) PreparationPedagogiqueBlock + "Tout générer"
├── tab-apres.tsx             # (server) ClosureFormationBlock + StepPendant fondu + 4 docs session + BatchProgress
├── tab-tous-documents.tsx    # (server) ParticipantDocMatrix plein écran + ZIP
└── tab-agenda.tsx            # (server) SessionCalendarSyncToggle + créneaux lecture
```
Reprendre `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` de `ProductTabs` (a11y déjà validée projet, UX-13).

### Anti-Patterns to Avoid
- **Recalculer l'état dans un onglet** : interdit. Tous lisent `stage` / `sessionCompleteness` / `closureStatus` calculés une fois dans le RSC parent et passés en props.
- **Démonter les onglets inactifs** (perte de scroll/état) : utiliser `hidden` en approche C, pas conditionnel `{active && <X/>}` si on veut le switch instantané. (Compromis mémoire négligeable, sections légères côté client.)
- **Recréer une 3ᵉ copie d'un doc** dans « Tous les documents » : c'est lecture seule (matrice), les actions vivent dans Avant/Après.

## Don't Hand-Roll

| Problème | Ne pas re-construire | Réutiliser | Pourquoi |
|---|---|---|---|
| Onglets `?tab=` + a11y | un système de tabs maison | `ProductTabs` / `LearnerTabs` (pattern repo) | a11y déjà validée, cohérence UI |
| Nettoyage jobs/batches bloqués | un nouveau script from scratch | `scripts/requeue-stuck-closure-jobs.ts` (existe) | déjà testé, gère PROCESSING>15min + QUEUED orphelins |
| Validation IA produit | une nouvelle UI/action produit | `AiDraftValidationBanner` + `validateAiDraftProduct` (existent) | déjà câblé sur la fiche produit |
| Génération docs niveau session | de nouveaux générateurs | les 4 server actions existantes (cf. Q3) | find-or-create idempotent déjà en place |
| Compteur « X manquants » | un recompte par onglet | `docCompletion(items)` (`lib/sessions/doc-completion.ts`) | source unique, anti-désync |
| État pack / grille / satisfaction | re-query | `getSessionClosureStatus` (`server/actions/closure-status.ts`) | déjà agrégé |
| Idempotence agenda | re-coder | Phase 14 `syncSessionCalendar` (clé `qualiof_key` + table `SessionCalendarSync`) | prouvée en prod (re-sync = 0 doublon) |

### Actions uniques au DocDockDrawer — analyse impérative (Q2)

**Vérifié par grep :** `dispatchGenerateDoc` et `dispatchGenerateMissing` ne sont importés QUE par `doc-dock-drawer.tsx`. **0 autre consommateur.** Donc supprimer le drawer SANS recâbler = perte sèche de ces capacités.

Actions déclenchées **uniquement** depuis `DocDockDrawer` (`doc-dock-drawer.tsx`) :

| Action drawer | Mécanisme | Existe ailleurs ? | Où la reporter |
|---|---|---|---|
| « Tout générer » (manquants pré-formation) | `handleGenerateAll` → `dispatchGenerateMissing` (L186-213) | **Non** (unique au drawer) | **Onglet « Avant » CTA « Tout générer »** — recâbler `dispatchGenerateMissing` |
| « clic génère ce doc » par ligne | `handleGenerate` → `dispatchGenerateDoc` (L154-184) | Partiellement : `SessionOnlyDocsBlock` couvre Déroulé/Grille/Checklist/Satisfaction ; **PAS** Convention/Convocation/AGEFICE/Analyse-besoin/Assiduité par stagiaire | **Onglet « Avant »** (Convention, Convocation, AGEFICE, Analyse besoin) une ligne par doc/stagiaire, via `dispatchGenerateDoc` |
| Régénérer (`force=true`) un doc | `handleGenerate(item, true)` (L399, L492) | matrice `ParticipantDocMatrix` a un menu cellule `regenerateParticipantDoc` (CENTRAL-02) pour les docs participant | Conserver dans les onglets de phase (re-générer) |
| Recherche live doc/apprenant | `query` state (L127-136) | **Non** | Optionnel ; remplaçable par les filtres de l'onglet « Tous les documents » (matrice) |
| Lien « Vue tableau » | footer → `#section-doc-matrix` | devient l'onglet « Tous les documents » | onglet 4 |
| Programme épinglé (générer/voir) | `PinnedItem` (L372) | `ProductProgrammeTab` (produit) + lecture seule session | lecture seule session + lien produit |

**Décision plan impérative (pré-condition de suppression LOCKED) :**
- **Conserver les server actions** `dispatchGenerateDoc` / `dispatchGenerateMissing` (`server/actions/dispatch-generate-doc.ts`) — elles sont le moteur réutilisable. Seule l'UI (drawer) est supprimée.
- **Onglet « Avant »** = recâble `dispatchGenerateMissing` sur « Tout générer » + lignes par stagiaire via `dispatchGenerateDoc` (docs : `CONVENTION`, `CONVOCATION`, `AGEFICE`, `ANALYSE_BESOIN`, `ASSIDUITE_AGEFICE`).
- **Onglet « Après »** = réembarque les 4 boutons unitaires de `SessionOnlyDocsBlock` (mêmes 4 actions Q3) + `GenerateClosurePackButton`.
- **Ordre Lot 2 :** réembarquer D'ABORD, supprimer le drawer/bloc ENSUITE. Le test « aucune action perdue » (cf. Validation Architecture) garde cette invariance.

**Note :** `dispatchGenerateDoc` couvre un `ASSIDUITE_AGEFICE` (`dispatch-generate-doc.ts:97-107`) que `SessionOnlyDocsBlock` ne couvre PAS — c'est une action utile à préserver explicitement dans l'onglet « Après ».

## Runtime State Inventory

Phase de **refonte UI/refactor** (pas de rename de string, pas de migration de données). L'inventaire reste pertinent pour le nettoyage des batches (Lot 4).

| Catégorie | Items trouvés | Action requise |
|---|---|---|
| Données stockées | `ClosureBatch` restés en `RUNNING`/`PENDING` + `ClosureJob` `PROCESSING`/`QUEUED` orphelins (les « 4 packs en cours »). Schéma : `schema.prisma:1456-1513`. | **Data migration douce** : clore les batches zombies (cf. Q6). Le script `requeue-stuck-closure-jobs.ts` traite les JOBS ; il manque la clôture du BATCH resté `RUNNING` quand tous ses jobs sont terminés/errored mais la transition finale n'a pas eu lieu. |
| Config service live | Aucune (Google Calendar : la synchro est idempotente, l'onglet Agenda n'écrit rien de nouveau). | None — vérifié : onglet Agenda réutilise `syncSessionCalendarAction` Phase 14. |
| État OS-enregistré | Aucun. | None. |
| Secrets / env vars | Aucun nouveau. | None. |
| Artefacts build / packages | Aucun (pas de rename de package, pas de `egg-info`). Mais `.next` doit être nettoyé en dev (`dev:full` fait déjà `rm -rf .next`). | None — convention `dev:full` existante suffit. |

**Question canonique batches zombies (Q6) :** après la refonte, le composant qui affichait le « pack en cours » page-wide (`BatchProgressAutoRefresh`, alimenté par `latestBatch` = dernier `ClosureBatch` trié `createdAt desc`, page L314-327 + L849) migre dans l'onglet « Après ». Un batch resté `RUNNING` continuera de s'afficher « en cours » tant qu'il n'est pas clos. Détection sûre vs faux positif :

- **Worker finalise via `bumpAndFinalize`** (`lib/closure/worker.ts:334-366`) : transaction `Serializable`, transition `PENDING/RUNNING → COMPLETED/PARTIAL/FAILED` **uniquement** quand `doneDocs + errorDocs >= totalDocs`. Si le worker est tué entre deux jobs, le batch reste `RUNNING` indéfiniment (jobs perdus de la queue BullMQ).
- **Critère de zombie sûr** (ne casse pas un batch réellement actif) : `ClosureBatch.status IN ('PENDING','RUNNING')` **ET** (`updatedAt` ou `startedAt`) `< now - 15min` **ET** aucun `ClosureJob` du batch en `QUEUED`/`PROCESSING` récent (< 15min). Aligné sur le seuil `STUCK_PROCESSING_MINUTES = 15` du script existant.
- **Outil recommandé** (discrétion Claude) : **étendre `requeue-stuck-closure-jobs.ts`** d'une 4ᵉ étape qui, après avoir marqué les jobs `PROCESSING` stale en `ERROR`, **recompte les jobs du batch et appelle la même logique de finalisation** (`doneDocs`/`errorDocs` vs `totalDocs`) pour basculer le batch en `PARTIAL`/`FAILED`/`COMPLETED`. Ou un script tsx dédié `close-zombie-batches.ts` réutilisant la condition. **Ne PAS** clore un batch dont un job est encore légitimement `PROCESSING` (< 15min) ou `QUEUED` présent dans BullMQ. Garde-fou : DRY-run par défaut (pattern Phase 14 `calendar:purge`), `WRITE=1` pour appliquer.

## Common Pitfalls

### Pitfall 1 : Doublon tarif en-tête « 3 024 € / stagiaire € / stagiaire » (Q7)
**Localisation exacte.** La condition de rendu est `SessionHeaderBar` lignes 146-156 : `priceSlot ? priceSlot : pricePerLearner !== null && (…fmtEUR… / stagiaire)`. C'est un **either/or correct**. La duplication venait de `SessionPriceInline` qui rendait son propre suffixe « / stagiaire » EN PLUS — **déjà corrigé** : `session-price-inline.tsx:54` met le suffixe dans `display` (`${fmtEUR.format(value)} / stagiaire`) et le commentaire L58-61 (« A3 — suffix retiré ») confirme le fix. **Vérifier en runtime** que le bug n'est pas réapparu ailleurs : chercher tout rendu où `priceSlot` ET le bloc par défaut coexistent. Si le bug persiste visuellement, la cause est dans `EditableField` (prop `display` + un éventuel `suffix`/`prefix` résiduel — `editable-field.tsx`). **Warning sign :** « € / stagiaire » apparaît 2× dans l'en-tête en mode `canEdit`.

### Pitfall 2 : Refetch silencieux à chaque switch d'onglet
**Cause :** cloner `ProductTabs` (`<Link href="?tab=">`) sur une page à ~10 requêtes re-exécute tout le RSC. **Évitement :** approche C (conteneur client + `pushState`). **Warning sign :** spinner/latence visible au clic d'onglet ; logs Prisma qui rejouent les 10 requêtes.

### Pitfall 3 : Supprimer le drawer avant de réembarquer ses actions uniques
**Cause :** `dispatchGenerateDoc`/`dispatchGenerateMissing` n'ont aucun autre consommateur. **Évitement :** Lot 2 réembarque AVANT de supprimer (test « aucune action perdue »). **Warning sign :** un doc pré-formation par stagiaire (AGEFICE, convocation, assiduité) devient ingénérable depuis la fiche.

### Pitfall 4 : Worker BullMQ — imports auth/React
**Cause :** si le nettoyage zombies (Lot 4) touche `lib/closure/*` et y importe `requireRole`/`validateRequest`/`react`, le worker crashe au boot (`react does not provide an export named 'cache'`). **Évitement :** garder le script de nettoyage worker-safe (importe `@qualiof/db` uniquement), comme `requeue-stuck-closure-jobs.ts`. **Warning sign :** crash boot tsx du worker.

### Pitfall 5 : Casser la source unique d'état
**Cause :** un onglet qui recalcule `completeness`/`stage` localement → désync. **Évitement :** calcul unique dans le RSC parent, props descendantes. **Warning sign :** récap (« Tous les documents ») et onglet de phase affichent des comptes différents.

### Pitfall 6 : `prisma migrate` — non applicable
Cette phase est **additive zéro schéma** (réorganisation UI + script de nettoyage). Aucune migration Prisma requise. Si un besoin de colonne émergeait (peu probable), respecter la dette projet : `prisma migrate deploy` sur Postgres local, pas seulement `generate` (feedback mémoire).

## Code Examples

### Conteneur onglets client (approche C) — squelette
```tsx
// apps/web/src/components/sessions/tabs/session-tabs.tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'session', label: 'Session' },
  { id: 'avant', label: 'Avant la formation' },
  { id: 'apres', label: 'Après la formation' },
  { id: 'docs', label: 'Tous les documents' },
  { id: 'agenda', label: 'Agenda' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function SessionTabs(props: {
  defaultTab: TabId;
  session: React.ReactNode; avant: React.ReactNode; apres: React.ReactNode;
  docs: React.ReactNode; agenda: React.ReactNode;
}) {
  const sp = useSearchParams();
  const active = (sp.get('tab') as TabId) ?? props.defaultTab; // 'session' par défaut

  function go(id: TabId) {
    const params = new URLSearchParams(sp.toString());
    id === 'session' ? params.delete('tab') : params.set('tab', id); // URL propre pour le défaut
    const qs = params.toString();
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname); // 0 round-trip
  }

  const panels: Record<TabId, React.ReactNode> = {
    session: props.session, avant: props.avant, apres: props.apres,
    docs: props.docs, agenda: props.agenda,
  };

  return (
    <>
      <nav role="tablist" aria-label="Onglets fiche session" className="border-b border-border flex overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} aria-controls={`tab-panel-${t.id}`}
            id={`tab-${t.id}`} type="button" onClick={() => go(t.id)}
            className={cn('px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors',
              active === t.id ? 'border-primary text-primary font-medium'
                              : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </nav>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`tab-panel-${t.id}`} aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </>
  );
}
```
*Source: pattern dérivé de `components/produits/tabs/product-tabs.tsx` (repo) + `window.history.pushState` (Next 14 docs, useSearchParams).* Note : `pushState` ne re-rend pas le RSC ; pour aussi supporter le deep-link au chargement (sans JS / refresh), la page RSC lit `sp.tab` et passe `defaultTab`. Le `<Link>` reste possible si on préfère une entrée history navigable (mais déclenche un refetch). Choix : `pushState` pour la fluidité, `defaultTab` serveur pour le deep-link.

### Réembarquement « Tout générer » (onglet Avant) — réutilise l'action existante
```tsx
// dans tab-avant — reprend handleGenerateAll du drawer, sans le drawer
import { dispatchGenerateMissing } from '@/server/actions/dispatch-generate-doc';
// items = docs pré-formation manquants (CONVENTION/CONVOCATION/AGEFICE/ANALYSE_BESOIN par stagiaire)
const r = await dispatchGenerateMissing({ sessionId, items: missing });
router.refresh();
```
*Source: `doc-dock-drawer.tsx:186-213` (logique conservée, UI déplacée).* 

## State of the Art

| Ancien (avant phase) | Cible | Impact |
|---|---|---|
| Scroll vertical 1069 lignes + timeline 5 étapes monolithique | 5 onglets `?tab=` | navigation, 1 doc = 1 endroit |
| `DocDockDrawer` (hub docs latéral) | actions réparties dans Avant/Après | suppression d'une surface ; actions préservées |
| Validation IA inline session (`InlineAiDraftValidator`) | produit uniquement (déjà existant) | retrait, pas re-création |
| `BatchProgressAutoRefresh` page-wide | suivi dans onglet « Après » | plus de bandeau flottant |
| `<details>` matrice repliée | onglet « Tous les documents » plein écran | lisibilité |

**Déprécié / à retirer après réembarquement :** `doc-dock-drawer.tsx`, `docs-button.tsx`, `session-only-docs-block.tsx`, `inline-ai-draft-validator.tsx` (après retrait du dernier usage), `buildDocDockItems` (`lib/sessions/doc-dock-items.ts`, alimente le drawer — devient orphelin), le wrapper `SessionWorkflowTimeline` (décomposé). Vérifier les orphelins par grep avant suppression (discipline projet : « orphelins stashés »).

## Open Questions

1. **Approche B vs C pour Lot 1.**
   - Connu : C évite le refetch ; B est le clone direct de `ProductTabs`.
   - Incertain : tolérance de Laurent au refetch sur Lot 1 (coquille vide, peu de data) vs Lot 2 (data lourde).
   - Reco : coquille Lot 1 en C dès le départ (le squelette ci-dessus est court) ; sinon B en Lot 1 puis migration C avant Lot 2.

2. **Recherche live du drawer : à reporter ou abandonner ?**
   - Connu : seul le drawer l'offre ; la matrice « Tous les documents » a des filtres (`MatrixFilters`).
   - Reco : abandonner la recherche live, les filtres matrice couvrent le besoin « trouver un doc ». À confirmer avec Laurent (non bloquant).

3. **Bug tarif : encore reproductible ?**
   - Connu : déjà corrigé dans `SessionPriceInline`. Le CONTEXT le liste en Lot 4.
   - Reco : vérifier en runtime sur `:3010` une session avec prix ; si plus reproductible, marquer Lot 4 « tarif » comme NO-OP documenté (pattern projet faux positif).

## Environment Availability

| Dépendance | Requise par | Disponible | Version | Fallback |
|---|---|---|---|---|
| Next.js / React / Prisma | toute la phase | ✓ (figé) | 14.2.21 / 18.3.1 / 5.22.0 | — |
| Redis (BullMQ) | nettoyage batches Lot 4 (re-enqueue) | ✓ (docker `qualiof_redis`) | 7 | DRY-run sans re-enqueue |
| Postgres local | tout | ✓ (docker, port via .env) | 16 | — |
| Ollama (mistral-small:24b) | génération docs (test E2E réembarquement) | ✓ (natif M-series) | — | tests mockés sans Ollama |
| Worker closure (`pnpm worker:closure`) | preuve nettoyage zombies | ✓ (process tsx) | — | script de nettoyage testable sans worker actif |
| Google Calendar API | onglet Agenda (Lot 3) | ✓ (OAuth Phase 14, `secrets/google-token.json`) | — | onglet Agenda dégradé en lecture-créneaux si token absent |

**Manquantes sans fallback :** aucune. **Manquantes avec fallback :** aucune bloquante — tout est local et déjà opérationnel (Phase 14 prouvée en prod).

## Validation Architecture

`workflow.nyquist_validation = true` (config.json) → section incluse.

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 2.1.8 (`apps/web`) |
| Config file | `apps/web/vitest.config.*` (présent ; smoke tests existants sous `components/sessions/__tests__/`) |
| Quick run command | `pnpm --filter @qualiof/web test -- <fichier> -t <nom>` |
| Full suite command | `pnpm --filter @qualiof/web test` |

### Phase Requirements → Test Map (par lot)
| Lot | Comportement | Type test | Commande automatisée | Fichier |
|---|---|---|---|---|
| 1 | `?tab=` détermine l'onglet rendu ; défaut = `session` ; tab inconnu → `session` (coerce) | unit | `pnpm --filter @qualiof/web test -- session-tabs.test -x` | ❌ Wave 0 `tabs/__tests__/session-tabs.test.tsx` |
| 1 | a11y : `role=tablist`/`role=tab`/`aria-selected` présents | smoke | idem | ❌ Wave 0 |
| 2 | **Non-divergence récap/onglets** : le compteur « manquants » de l'onglet « Après » = `docCompletion(items)` (même source que matrice) | unit | `pnpm --filter @qualiof/web test -- doc-completion-source.test` | ❌ Wave 0 |
| 2 | **Aucune action perdue** : « Tout générer » appelle `dispatchGenerateMissing` ; chaque doc pré-formation par stagiaire appelle `dispatchGenerateDoc` avec le bon `docType` | behavior (mocké) | `pnpm --filter @qualiof/web test -- avant-tab-actions.test` | ❌ Wave 0 |
| 2 | Les 4 docs niveau session (Déroulé/Grille/Checklist/Satisfaction) ont leur bouton générer dans « Après » câblé sur la bonne action | behavior | `pnpm --filter @qualiof/web test -- apres-session-docs.test` | ❌ Wave 0 |
| 3 | Onglet Agenda appelle `syncSessionCalendarAction` ; idempotence (re-sync = 0 doublon) déjà prouvée Phase 14 — re-tester au niveau action mockée | behavior | `pnpm --filter @qualiof/web test -- calendar-sync` (suite Phase 14 existe) | ✅ existe (calendar 67 tests) |
| 4 | Validation IA absente de la session ; lien produit présent | smoke | `pnpm --filter @qualiof/web test -- session-no-ai-validator.test` | ❌ Wave 0 |
| 4 | **Nettoyage zombie sûr** : un batch `RUNNING` avec tous jobs terminés et `updatedAt < now-15min` → clos ; un batch `RUNNING` récent ou avec job `QUEUED`/`PROCESSING` < 15min → **NON touché** | unit (logique pure) | `pnpm --filter @qualiof/web test -- close-zombie-batches.test` | ❌ Wave 0 |
| 4 | Bug tarif : en-tête ne contient « / stagiaire » qu'une fois en mode édition | smoke | `pnpm --filter @qualiof/web test -- session-header-price.test` | ❌ Wave 0 (ou NO-OP documenté si non reproductible) |

### Sampling Rate
- **Per task commit :** `pnpm --filter @qualiof/web test -- <fichier touché>`
- **Per wave/lot merge :** `pnpm --filter @qualiof/web test` (suite complète, ~700+ tests baseline)
- **Phase gate :** suite verte + checkpoint visuel Laurent (navigation 5 onglets sur `:3010`, deep-link, refresh préserve l'onglet) avant `/gsd:verify-work`.

### Test de puissance (mutation) — gate obligatoire
Au gate de chaque lot, casser une branche du test clé (ex. faire renvoyer le mauvais `docType` à `dispatchGenerateDoc`, ou renvoyer `defaultTab` au lieu de `?tab=`) → le test DOIT virer ROUGE → restaurer. Prouve que le test garde quelque chose (discipline projet établie 2026-06-10).

### Wave 0 Gaps
- [ ] `components/sessions/tabs/__tests__/session-tabs.test.tsx` — routage onglet + coerce + a11y (Lot 1)
- [ ] `components/sessions/tabs/__tests__/doc-completion-source.test.ts` — non-divergence source unique (Lot 2)
- [ ] `components/sessions/tabs/__tests__/avant-tab-actions.test.tsx` — aucune action perdue (Lot 2)
- [ ] `components/sessions/tabs/__tests__/apres-session-docs.test.tsx` — 4 docs session câblés (Lot 2)
- [ ] `lib/closure/__tests__/close-zombie-batches.test.ts` — condition de clôture sûre (Lot 4)
- [ ] `components/sessions/__tests__/session-no-ai-validator.test.tsx` — IA absente session (Lot 4)
- [ ] Réutiliser la suite calendar Phase 14 (Lot 3, pas de nouveau fichier requis)
- [ ] Pas de framework à installer (Vitest présent).

## Sources

### Primary (HIGH confidence)
- Code source local (chemins + lignes cités) : `apps/web/src/app/app/sessions/[id]/page.tsx`, `components/sessions/*`, `components/sessions/qualiopi-matrix/*`, `components/produits/tabs/*`, `server/actions/dispatch-generate-doc.ts`, `server/actions/generate-grille-obs-session.ts`, `server/actions/generate-satisfaction-session.ts`, `server/actions/generate-checklist-formation.ts`, `lib/closure/worker.ts`, `scripts/requeue-stuck-closure-jobs.ts`, `packages/db/prisma/schema.prisma:1456-1513`.
- Context7 `/vercel/next.js/v14.3.0-canary.87` — `useSearchParams`, `page.mdx` (searchParams prop), `window.history.pushState` (mise à jour URL sans round-trip).
- `.planning/PLAN-FICHE-SESSION-ONGLETS-RECAP.md`, `15-CONTEXT.md`, `CLAUDE.md`, `.planning/config.json`.

### Secondary (MEDIUM confidence)
- STATE.md / MEMORY.md (historique : quick `260525-jpq` docs niveau session, Phase 14 idempotence prouvée, conventions worker-safe).

### Tertiary (LOW confidence)
- Aucune. Toutes les affirmations factuelles sont vérifiées sur le code local.

## Metadata

**Confidence breakdown :**
- Standard stack : HIGH — aucune nouvelle dépendance, briques existantes vérifiées au fichier/ligne.
- Architecture (onglets, inventaire réutiliser/supprimer) : HIGH — page lue intégralement, précédents `ProductTabs`/`LearnerTabs` lus.
- Q2 (actions uniques drawer) : HIGH — grep exhaustif (0 autre consommateur de `dispatchGenerate*`).
- Q3 (docs session) : HIGH — 4 server actions localisées et lues.
- Q5 (validation IA produit) : HIGH — UI + action produit déjà présentes.
- Q6 (batches zombies) : HIGH sur le schéma/worker/script ; MEDIUM sur la forme exacte de l'outil (discrétion Claude).
- Q7 (bug tarif) : HIGH sur la localisation ; MEDIUM sur la reproductibilité runtime actuelle (déjà partiellement corrigé).

**Research date :** 2026-06-26
**Valid until :** ~2026-07-26 (code stable, Next 14 figé ; revalider si refonte de `ProductTabs` ou des générateurs entre-temps).
