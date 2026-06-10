# Phase 3: Responsive content layouts - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Source:** Audit UX/QA 2026-05-12 + recensement code 2026-05-13

<domain>
## Phase Boundary

Adapter les **grilles internes et listings** des pages QualiOF pour qu'elles refluent correctement sur mobile (390px) et tablette (768px), maintenant que la sidebar et le main sont responsive (Phase 2).

Audit pointait :
- Dashboard tronqué à 1456px (KPI / Pipeline / Financeurs)
- Listings (sessions, apprenants, dossiers OPCO) probablement illisibles en mobile (tables fixes)
- Aucun reflow visible sur les fiches détail

**Recensement code (2026-05-13) :**
- 35 occurrences `grid-cols-N` au total dans `apps/web/src/`
- ~20 sans variant responsive (mobile = même nombre de colonnes que desktop)
- 5 grilles dashboard déjà responsive mais avec `lg:grid-cols-6/7` → 6-7 colonnes à 1024px+, peut être trop dense à 1456px
- Listings principaux (`/app/sessions`, `/app/apprenants`, `/app/dossiers-opco`) utilisent `<DataTable />` (`apps/web/src/components/ui/data-table.tsx`) — vérifier comportement mobile
</domain>

<decisions>
## Implementation Decisions

### RESP-04 — Grids responsive (pages + composants)

- Décision verrouillée : **règle générale `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-N`** pour toute grille avec N >= 2 colonnes desktop. La base mobile = 1 colonne SAUF cas où `grid-cols-2` même en mobile reste lisible (KPI counters compacts < 4 caractères).
- Décision verrouillée : Pour les `grid-cols-2` actuels qui sont des paires "label / valeur" (formulaires, fiches) : garder `grid-cols-1 sm:grid-cols-2` (passe à 2 cols dès 640px).
- Décision verrouillée : Pour les `grid-cols-3` qui sont des stats/KPI compactes : `grid-cols-2 sm:grid-cols-3` (acceptable 2 cols en mobile car valeurs courtes).
- Décision verrouillée : Pour les `grid-cols-N` (N=4..7) sur dashboard : ajouter `xl:` variant pour densifier seulement à >= 1280px. Garder `lg:grid-cols-3` ou `lg:grid-cols-4` à 1024px pour respiration. Ex : `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7`.
- Décision verrouillée : **Dashboard `/app/page.tsx` traité dans une task dédiée** car le plus visible et le plus impacté par l'audit (KPI tiles = première impression).

### RESP-05 — Listings (tables) responsive

- Décision verrouillée : Les listings utilisent `<DataTable />`. Sur mobile, deux options :
  - **(a) Préférée :** wrapper le DataTable dans `<div className="overflow-x-auto -mx-4 sm:mx-0">` (scroll horizontal + neutralise le `p-8` du `<main>` côté mobile pour gagner de la place).
  - **(b) Plus tard (v2) :** card view mobile (chaque ligne devient une carte). Trop de chantier pour cette phase.
- Décision verrouillée : Les filtres (FilterChips) au-dessus des listings restent en `flex flex-wrap` (déjà OK).
- Décision verrouillée : Pas de modification du composant `<DataTable />` lui-même (réutilisé partout) ; le wrapping responsive est fait au site d'usage de chaque page.
- Décision verrouillée : QA visuel sur 4 viewports (390 / 768 / 1024 / 1440) sur les 6 pages clés (dashboard, sessions list/détail, apprenants list/détail, dossier OPCO détail). Captures à attacher au commit.

### Out of scope

- Refonte du composant `<DataTable />` (column priority, hide-on-mobile cols) — futur milestone si nécessaire.
- Card-view mobile pour les listings — v2.
- Refonte typographique mobile (font-size adaptatif) — Phase 6 polish.
- Modification de la TopBar ou de la sidebar (Phase 2 livrée).
- Modification de `tailwind.config.ts` (Phase 2 a confirmé qu'aucune modif n'est nécessaire).

### Claude's Discretion

- Choix exact des breakpoints par grille selon le contenu (combien de cols à `sm`, `md`, `lg`, `xl`).
- Ordre des fixes dans le plan (probablement dashboard en priorité car le plus visible).
- Si besoin, regrouper par "type de grille" (KPI tiles, formulaires, panels stats) pour ne pas refaire les mêmes décisions à chaque fichier.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/codebase/CONCERNS.md` — Sections #4 #5 corrigées Phase 2
- `.planning/PROJECT.md` — Active requirements RESP-04, RESP-05
- `.planning/REQUIREMENTS.md` — REQ-IDs exacts

### Pages et composants en scope (recensement 2026-05-13)

**Pages avec grid-cols (à auditer / fixer) :**
- `apps/web/src/app/app/page.tsx` — DASHBOARD (5 grilles, déjà responsive mais à densifier `xl:`)
- `apps/web/src/app/app/budget-agefice/page.tsx`
- `apps/web/src/app/app/dossiers-opco/page.tsx` (1 non-responsive ligne 506)
- `apps/web/src/app/app/produits/page.tsx`, `produits/[id]/page.tsx`
- `apps/web/src/app/app/preinscriptions/page.tsx`, `preinscriptions/[id]/page.tsx`
- `apps/web/src/app/app/formateurs/page.tsx`, `formateurs/[id]/page.tsx`
- `apps/web/src/app/app/leads/page.tsx`
- `apps/web/src/app/app/sessions/[id]/page.tsx` (déjà `lg:grid-cols-3`)
- `apps/web/src/app/app/organisations/[id]/page.tsx`
- `apps/web/src/app/app/factures/[id]/page.tsx`
- `apps/web/src/app/app/financeurs/page.tsx`, `financeurs/[code]/page.tsx`
- `apps/web/src/app/app/apprenants/[id]/page.tsx` (déjà partiellement responsive)
- `apps/web/src/app/app/parametres/page.tsx`

**Composants avec grid-cols non-responsive (à fixer) :**
- `apps/web/src/components/forms/create-*.tsx` (4 fichiers)
- `apps/web/src/components/wizards/quick-create-product.tsx` (2 occurrences)
- `apps/web/src/components/preinscriptions/new-link-button.tsx`
- `apps/web/src/components/invoices/record-payment-form.tsx`
- `apps/web/src/components/sessions/duplicate-session-button.tsx`, `session-satisfaction-panel.tsx`
- `apps/web/src/components/produits/product-satisfaction-panel.tsx`
- `apps/web/src/components/apprenants/identity-docs-card.tsx`, `learner-quick-view-button.tsx`

**Composants listings :**
- `apps/web/src/components/ui/data-table.tsx` — base réutilisée (NE PAS modifier)
- Sites d'usage : pages list à wrapper

### Reference files (read only)

- `apps/web/src/components/ui/data-table.tsx` — pour comprendre la structure du table à wrapper
- `apps/web/tailwind.config.ts` — confirmation breakpoints OK
</canonical_refs>

<specifics>
## Specific Ideas

- **Pattern wrapper listing responsive** :
  ```tsx
  <div className="overflow-x-auto -mx-4 sm:mx-0">
    <DataTable {...} />
  </div>
  ```
  Le `-mx-4 sm:mx-0` neutralise le `p-8` (= `px-8`) du `<main>` côté mobile pour gagner 64px de largeur.

- **Pattern dashboard KPI tiles** : pour `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` actuel :
  ```
  AVANT: grid-cols-2 md:grid-cols-3 lg:grid-cols-6
  APRÈS: grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6
  ```
  Densification progressive : 2 → 3 → 4 → 6 cols. À 1456px (xl, viewport >= 1280px), 6 colonnes ; à 1024-1279 (lg), 4 colonnes. Évite les KPI cards comprimés à 200px.

- **Pattern formulaire 2 cols** : `grid-cols-2` (sans préfixe) → `grid-cols-1 sm:grid-cols-2` pour ne pas comprimer les champs en mobile (sm = 640px).

- **Pattern stats compactes 3 cols** : `grid-cols-3` (sans préfixe) reste OK en mobile si valeurs courtes (chiffres, badges) → `grid-cols-3` peut être conservé. À évaluer cas par cas.

</specifics>

<deferred>
## Deferred Ideas

- **Card-view mobile pour DataTable** — refondre chaque ligne en carte avec hiérarchie d'info (label primaire / secondaire). Gros chantier, v2.
- **Hide-on-mobile columns** — système de priority sur DataTable (col1 toujours, col2 sm+, col3 md+, etc.). v2.
- **Dashboard mobile dédié** (vue compacte avec 4 KPI prioritaires en grand) — Phase 6 (UX-11 hiérarchisation).
- **Sticky filters** au scroll listings mobile — nice-to-have v2.
- **Tests E2E responsive Playwright** — `TEST-01` v2.
</deferred>

---

*Phase: 03-responsive-content-layouts*
*Context gathered: 2026-05-13*
