# Phase 15: Refonte fiche session en 5 onglets - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** Brainstorming + plan validé Laurent (`.planning/PLAN-FICHE-SESSION-ONGLETS-RECAP.md`)

<domain>
## Phase Boundary

**Ce que cette phase livre :** remplacer le scroll de 1069 lignes de la fiche session (`apps/web/src/app/app/sessions/[id]/page.tsx`) par **5 onglets** suivant le workflow réel d'une formation, avec **chaque document rangé à un seul endroit** (suppression des ~16 surfaces redondantes), la **validation programme IA déplacée au niveau produit**, et un **nettoyage des batches zombies**.

**C'est une réorganisation de SURFACE, pas une reconstruction.** Tout le câblage métier (générateurs de docs, server actions, closure pack BullMQ, `getSessionCompleteness`/`sessionStage`, completeness) est réutilisé tel quel. On change le contenant (onglets), pas la logique.

**Hors scope (conservé, rebranché plus tard) :** Facturation, Évaluation/stats, conformité audit lourde (bandeau « prêt pour audit », blockers IA, rails handicap/amélioration/sous-traitants, tâches T1-T13). Cf. annexe §8 du plan source.
</domain>

<decisions>
## Implementation Decisions

### Structure : 5 onglets (LOCKED)
Onglet actif dans l'URL (`?tab=`) pour deep-link + survie au `router.refresh()` que déclenchent les générations de docs. Onglet par défaut = **Session**.
1. **Session** — produit (lecture seule + lien fiche produit), dates, lieu, formateur, statut, **inscription des apprenants** (liste nominative + CFP/CNI/RIB → budget AGEFICE → seed analyse besoin). CTA : « Inscrire un apprenant ».
2. **Avant la formation** — Convention/contrat (+CGV, devis) · AGEFICE (par stagiaire éligible) · Analyse de besoins (par stagiaire) · Convocation (par stagiaire). CTA : « Tout générer ».
3. **Après la formation** (le pack, « Pendant » fondu ici) — Attestation · Bilan formateur · Certificat de réalisation · Assiduité/émargement · Satisfaction chaud · Satisfaction froid · Positionnement · (niveau session) Grille d'observation session + Bilan satisfaction session. CTA : « Générer le pack ». Le suivi du batch en cours s'affiche DANS cet onglet (plus de bandeau flottant page-wide).
4. **Tous les documents** — vue LECTURE SEULE : matrice apprenant × document (l'actuelle `ParticipantDocMatrix` promue en onglet plein écran et lisible) + filtres + « Télécharger le ZIP ». PAS une 2ᵉ source d'action.
5. **Agenda** — synchro Google Calendar (Phase 14, agenda « Rappel Formations », idempotent) + affichage créneaux en lecture. Créneaux éditables interactifs = chantier suivant, hors phase.

### Règles non négociables (LOCKED)
- **1 doc = 1 maison** : chaque document vit dans l'onglet de son moment (Avant/Après) et nulle part ailleurs. « Tous les documents » montre, les onglets de phase agissent.
- **Source unique d'état** : tous les onglets lisent le même `getSessionCompleteness`/`sessionStage`. Aucune computation parallèle, zéro désync.
- **En-tête persistant = identité + statut + 1 CTA contextuel + bouton Paramètres** (formateur/lieu/logistique). Allégé, au-dessus des onglets. Pas de barre de 6 boutons.
- **Le programme quitte la session** : « Valider le programme IA » se gère au niveau PRODUIT (création/édition). Sur la session, programme en lecture seule + lien produit.
- **Génération sur donnée prête, pas sur navigation** : un doc se génère/relance quand sa donnée source est complète, jamais au seul fait d'ouvrir l'onglet. Statut par doc visible (à générer / en cours / prêt / à revoir), idempotent.
- **Invalidation à l'édition** : éditer une étape antérieure périme les docs dépendants (pattern `updatedAt`/`PROMPT_VERSION`). Navigation libre entre onglets (pas un wizard verrouillé).
- **Lisibilité** : fini les cartes 4-colonnes en `text-[11px]`. Une ligne par doc, statut + action claire.
- **Réutiliser l'existant** : réembarquer les blocs d'étape, l'édition inline, `normalizeNullableText`.

### Surfaces à SUPPRIMER (LOCKED, après vérif « aucune action unique perdue »)
- `SessionOnlyDocsBlock` (les 4 cartes minuscules illisibles)
- `DocDockDrawer` + `DocsButton` (le drawer latéral et son bouton)
- Lignes docs dupliquées dans les blocs de phase existants (`PreparationPedagogiqueBlock`, `ClosureFormationBlock`) — réembarquées proprement dans les onglets, pas redondées.
- **Pré-condition impérative** : avant toute suppression, vérifier qu'aucune action ne vit UNIQUEMENT dans le drawer (ex. « clic génère ce doc » du DocDock). Si oui, la porter dans l'onglet AVANT de supprimer.

### Découpage en 4 lots (séquence de commits)
1. **Lot 1** — Coquille à onglets (`?tab=` URL) + en-tête allégé. 5 onglets câblés vides + nav deep-link.
2. **Lot 2** — Réembarquer le contenu dans les onglets + supprimer les doublons (cartes, drawer, bouton).
3. **Lot 3** — Onglet Agenda (synchro Google Calendar Phase 14 + créneaux lecture).
4. **Lot 4** — Programme « Valider IA » déplacé au niveau produit + nettoyage batches zombies (`ClosureBatch` restés RUNNING/PROCESSING) + correctifs visuels résiduels (CTA `NextActionHero` cohérent, doublon tarif en-tête).

### Claude's Discretion
- Mécanique exacte du conteneur à onglets (composant client recevant les sections pré-rendues en props vs nested routes — privilégier le plus simple sans refetch au switch).
- Structure de fichiers des nouveaux composants d'onglet.
- Forme exacte de l'outil de nettoyage des batches zombies (script tsx vs server action admin).
- Stratégie de tests Vitest par lot (routage onglet, non-divergence récap/onglets, idempotence agenda).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Plan source (fait foi pour cette phase)
- `.planning/PLAN-FICHE-SESSION-ONGLETS-RECAP.md` — vision 5 onglets, règles, 4 lots, et annexe §8 (conformité T1-T13 + dette Lot E hors scope).

### Code à réorganiser (cartographie 2026-06-26)
- `apps/web/src/app/app/sessions/[id]/page.tsx` (1069 lignes) — la page à refondre. Fait toutes les requêtes serveur (à conserver). Rend dans l'ordre : SessionHeaderBar, NextActionHero, status/dates, BatchProgressAutoRefresh, timeline 5 étapes (StepCreation, SessionParticipantsList, PreparationPedagogiqueBlock, StepPendantFormation, ClosureFormationBlock, SessionEvaluationBlock, StepFacturation), SessionOnlyDocsBlock, ParticipantDocMatrix.
- `apps/web/src/components/sessions/` — tous les blocs/boutons (session-header-bar, next-action-hero, docs-button, doc-dock-drawer, inline-ai-draft-validator, qualiopi-matrix/session-only-docs-block, preparation-pedagogique-block, closure-formation-block, qualiopi-matrix/participant-doc-matrix, batch-progress-auto-refresh, closure-batch-progress, generate-closure-pack-button, session-calendar-sync-toggle).
- `apps/web/src/lib/sessions/doc-completion.ts` + `getSessionCompleteness`/`sessionStage` — source unique d'état (à NE PAS dupliquer).
- `apps/web/src/components/sessions/inline-ai-draft-validator.tsx` + server action `validateAiDraftProduct` — la validation programme IA à déplacer vers la fiche PRODUIT.
- `apps/web/src/lib/calendar/*` + `apps/web/src/server/actions/calendar-sync.ts` (Phase 14) — pour l'onglet Agenda.
- `ClosureBatch`/`ClosureJob` (schema Prisma) + `closure-worker` — pour le nettoyage zombies et le suivi pack.

### Project guidelines
- `CLAUDE.md` (racine repo) — conventions QualiOF (routes FR kebab-case + redirect 308, Server Actions, Zod `packages/shared/src/schemas/`, tenantId scope, footer PDF, Tailwind breakpoints).
</canonical_refs>

<specifics>
## Specific Ideas

- **Question ouverte à trancher au plan (plan source §7.3)** : la **Grille d'observation session** et le **Bilan satisfaction session** (docs « niveau session », pas par stagiaire) sont le trou récurrent des « X manquants ». Vérifier s'ils ont DÉJÀ un chemin de génération à l'unité (cf. quick `260525-jpq` : `generateGrilleObsSessionForSession`, `generateChecklistForSession`, `generateDerouleForProduct` existent) ; sinon, le compléter pour que l'onglet « Après » soit complet.
- Les « 4 packs en cours » = `BatchProgressAutoRefresh` lisant le dernier `ClosureBatch` resté en `RUNNING`/`PROCESSING`. Le nettoyage doit clore ces batches zombies sans casser un batch réellement en cours.
- L'en-tête actuel a un bug de **tarif dupliqué** (« 3 024 € / stagiaire € / stagiaire ») : `priceSlot` se rend à côté du rendu par défaut au lieu de le remplacer (Lot 4).
</specifics>

<deferred>
## Deferred Ideas

- Facturation (`StepFacturation`) et Évaluation/stats (`SessionEvaluationBlock`) — sortis du flux principal, rebranchés dans un 2ᵉ temps.
- Conformité audit T1-T13 + bandeau « prêt pour audit » + blockers IA + rails handicap/amélioration/sous-traitants (annexe §8.1/§8.3 du plan source).
- Dette Lot E (annexe §8.2) : E0 transition auto VALIDATED→IN_PROGRESS, E-tech-1 tsc redirect-308, E-data-1..5 (réconciliation SmartOF, prix, SES-0086, sha256 superseded, check circulaire).
- Créneaux agenda éditables interactifs (SessionSlot) — chantier suivant après cette refonte.
</deferred>

---

*Phase: 15-refonte-fiche-session-onglets*
*Context gathered: 2026-06-26 via brainstorming + plan validé*
