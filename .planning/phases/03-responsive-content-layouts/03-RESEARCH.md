# Phase 3: Responsive content layouts - Research

**Researched:** 2026-05-13
**Status:** Research complete

## Phase Summary

Audit exhaustif des grilles QualiOF (35 occurrences `grid-cols-N` recensées) + correction systématique des grilles non-responsive + wrap des listings DataTable pour scroll horizontal mobile. 2 requirements (RESP-04, RESP-05). Phase légère côté logique, surtout du polish CSS méthodique.

## Findings par requirement

### RESP-04 — Grids des pages et composants

**Audit code complet (35 occurrences) :**

**Catégorie A — Déjà responsive (rien à faire ou juste vérifier) :**
- `app/app/page.tsx` (5 grilles dashboard) — toutes ont au moins `md:grid-cols-N`. À densifier avec `xl:` pour mieux exploiter les très grands écrans + éviter compression à 1024-1279.
- `app/app/sessions/[id]/page.tsx:310` — `grid-cols-1 lg:grid-cols-3` ✓
- `app/app/apprenants/[id]/page.tsx` (3 grilles) — déjà `grid-cols-1 lg:`, `grid-cols-1 sm:`, `grid-cols-2 md:`
- `app/app/dossiers-opco/page.tsx:549` — `grid-cols-2 md:grid-cols-4` ✓

**Catégorie B — À fixer (grids sans préfixe responsive) :**

Pages :
- `app/app/dossiers-opco/page.tsx:506` — `grid-cols-3 gap-2 text-xs` → fixer
- `app/app/organisations/[id]/page.tsx:212` — `grid-cols-2 gap-2`
- `app/app/financeurs/page.tsx:129` — `grid-cols-2 gap-3`

Composants forms (cas typique : champs adresse/identité côte-à-côte) :
- `components/forms/create-trainer-button.tsx:69` — `grid-cols-2 gap-3`
- `components/forms/create-product-button.tsx:106` — `grid-cols-3 gap-3`
- `components/forms/create-organization-button.tsx:79` — `grid-cols-2 gap-3`
- `components/forms/create-person-button.tsx:307,325,335,349,363` (5 occurrences)
- `components/wizards/quick-create-product.tsx:250,291` (2)
- `components/preinscriptions/new-link-button.tsx:83`
- `components/invoices/record-payment-form.tsx:83`
- `components/sessions/duplicate-session-button.tsx:126`
- `components/sessions/session-satisfaction-panel.tsx:94`
- `components/produits/product-satisfaction-panel.tsx:132`
- `components/apprenants/identity-docs-card.tsx:33` — `grid-cols-1 gap-2` (déjà 1 col, OK)
- `components/apprenants/learner-quick-view-button.tsx:135`

**Stratégie de fix par catégorie :**

| Pattern actuel | Cas d'usage | Fix proposé | Pourquoi |
|----------------|-------------|-------------|----------|
| `grid-cols-2` (formulaires côte-à-côte) | champs label/valeur 2 cols desktop | `grid-cols-1 sm:grid-cols-2` | mobile = 1 col pour ne pas comprimer les inputs |
| `grid-cols-3` (stats/KPI compacts) | chiffres courts à 3 cols | `grid-cols-3` (KO si formulaire) ou `grid-cols-2 sm:grid-cols-3` | dépend du contenu — texte court = OK 3 cols mobile |
| `grid-cols-3 gap-2 text-xs` (dossiers-opco:506) | mini stats badge | `grid-cols-3 sm:grid-cols-3` ou `grid-cols-2 sm:grid-cols-3` selon dimension | inspect visuel |
| `grid-cols-N` dans Dialog/modal (popup) | layout interne d'un modal | `grid-cols-1 sm:grid-cols-N` | les modals sont étroites en mobile |

**Dashboard `/app/page.tsx` — densification** :

Lignes actuelles :
```
ligne 109: grid-cols-2 md:grid-cols-3 lg:grid-cols-6  ← KPI principaux
ligne 118: grid-cols-2 md:grid-cols-3                 ← KPI secondaires
ligne 140: grid-cols-2 md:grid-cols-4 lg:grid-cols-7  ← AGEFICE/Sessions
ligne 152: grid-cols-1 lg:grid-cols-2                  ← Pipeline / Financeurs
ligne 198: grid-cols-1 lg:grid-cols-3                  ← Stats par catégorie
```

À 1024-1279px viewport (lg), `lg:grid-cols-6` ou `lg:grid-cols-7` donne des cards à ~120-150px de largeur (selon sidebar visible). Trop comprimé pour KPI avec montants `12 345 €` + label.

Densification proposée :
```
ligne 109: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6
ligne 140: grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7
```

Ainsi : 6/7 cols seulement à viewports >= xl (1280px+).

### RESP-05 — Listings responsive

**Composant DataTable** : `apps/web/src/components/ui/data-table.tsx`. Réutilisé dans toutes les pages list. Si on modifie le composant lui-même, on impacte tout d'un coup (risque). Préférer wrapping au site d'usage.

**Pages listings principales :**
- `app/app/sessions/page.tsx` — utilise probablement `<DataTable />`
- `app/app/apprenants/page.tsx` — idem
- `app/app/dossiers-opco/page.tsx` — `wc -l` montre 549+ lignes, complexe (mix DataTable + grids)
- `app/app/preinscriptions/page.tsx` — idem
- `app/app/formateurs/page.tsx`, `app/app/produits/page.tsx`, `app/app/leads/page.tsx`, `app/app/organisations/page.tsx` (à confirmer)

**Pattern recommandé (au site d'usage) :**
```tsx
<div className="overflow-x-auto -mx-4 sm:mx-0">
  <DataTable columns={...} data={...} />
</div>
```
- `overflow-x-auto` : table peut scroller horizontalement si nécessaire
- `-mx-4 sm:mx-0` : neutralise le `p-8` (px-8) du `<main>` en mobile, gagne 64px de largeur. **Vérifier que `<main>` est bien `p-8`** (peut-être `p-4 md:p-8` après Phase 2).

**Vérification du `<main>` actuel :**
- `app/app/layout.tsx` : `<main className="flex-1 p-8 max-w-screen-2xl w-full mx-auto">`
- Phase 2 n'a pas modifié `<main>`. Donc en mobile, `p-8` = 32px de padding chaque côté = perte de 64px.
- Décision : Phase 3 modifie aussi `<main>` à `p-4 md:p-8` pour gain mobile. (Petit fix global mais utile.)

### Pitfalls cross-cutting

1. **Sticky header (Phase 1)** ne doit pas régresser. `<main>` a `flex-1` mais MainContent n'a plus `min-h-screen` → OK.

2. **Cmd+K palette** (Radix Dialog déjà responsive normalement) ne doit pas casser.

3. **Dialogs/modals existantes** (Radix Dialog) : leurs grids internes sont aussi à fixer (forms create-*, satisfaction-panel, etc.). En modal sur mobile, la modal occupe ~85vw — `grid-cols-2` y est encore plus comprimé que dans la page.

4. **Tableau scroll horizontal** : ajout de `overflow-x-auto` sur un wrapper crée un nouveau contexte de scroll. Vérifier que les éventuels `sticky` à l'intérieur du tableau (header de colonnes ?) ne cassent pas. Le DataTable actuel n'a probablement pas de sticky col header (à confirmer).

5. **Largeur minimum des KPI cards** : si une card a `min-w-[180px]` et qu'on la met dans `grid-cols-6`, elle force la grille à exploser → overflow horizontal. À auditer.

6. **`text-xs` + grille étroite** : peut donner un texte illisible sur mobile (10px). Augmenter base à `text-sm` si nécessaire dans certains cas.

## Validation Architecture

> Cette section informe la création de `03-VALIDATION.md` (Nyquist Dimension 8).

**Dimensions critiques à valider :**

### 1. Toutes les `grid-cols-N` (N >= 2) ont au moins un variant `sm:` ou `md:`
- **Type :** Test grep automatisé
- **Acceptance :** `grep -rE 'grid-cols-[2-9]+' apps/web/src/ | grep -vE '(sm|md|lg|xl):' | wc -l` → cible 0 (ou liste exempted documentée)
- **Coverage :** Audit de tous les fichiers post-fix

### 2. Dashboard reflow OK sur 4 viewports
- **Type :** Manual visual + DevTools
- **Acceptance :** Sur `/app` à 390 / 768 / 1024 / 1440 px : KPI cards lisibles (texte non tronqué), grilles bien réparties, pas de scroll horizontal du contenu.
- **Coverage :** 4 captures attached

### 3. Listings scrollables horizontalement en mobile
- **Type :** Manual visual
- **Acceptance :** Sur `/app/sessions`, `/app/apprenants`, `/app/dossiers-opco` à 390px : tableau visible (peut être scrollé H), header et au moins 1 ligne data visibles, pas de débordement de la page entière.
- **Coverage :** 3 captures

### 4. Build Next.js OK
- **Type :** Auto
- **Acceptance :** `pnpm --filter @qualiof/web build` → exit 0
- **Coverage :** Une fois en fin de phase

### 5. Aucune régression Phase 1+2
- **Type :** Auto + manual
- **Acceptance :** Smoke test 2/2, redirects 308 OK, sticky header sur 3 pages, sidebar drawer mobile encore fonctionnel
- **Coverage :** Re-run scripts Phase 1/2

### Validation success threshold

Phase 3 = SUCCESS si :
- Grep "grid-cols sans responsive" → 0 (ou documenté)
- 4 viewports captures du dashboard OK
- 3 captures listings mobile scrollables OK
- Build clean
- Phase 1+2 non régressées

## Recommendations for planner

1. **Granularité :** 4 plans + bookkeeping
   - 03-01 : Dashboard densification (`/app/page.tsx`) — visible #1, à isoler
   - 03-02 : Grids des pages restantes (audit + fix systématique)
   - 03-03 : Grids des composants (forms, wizards, panels)
   - 03-04 : Listings responsive (wrapper `overflow-x-auto` + `<main>` `p-4 md:p-8`)
   - 03-05 : Bookkeeping wave 2

2. **Files modified :**
   - 03-01 : `apps/web/src/app/app/page.tsx`
   - 03-02 : ~10 fichiers `app/app/*/page.tsx`
   - 03-03 : ~15 composants
   - 03-04 : ~5 fichiers list pages + `app/app/layout.tsx`
   - 03-05 : `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`

3. **Wave structure :**
   - Wave 1 : 03-01, 03-02, 03-03, 03-04 — files disjoints, parallèles
   - Wave 2 : 03-05 (bookkeeping)

4. **must_haves :** Les 4 success criteria de la roadmap.

---

## RESEARCH COMPLETE

*Phase: 03-responsive-content-layouts*
*Researched: 2026-05-13*
