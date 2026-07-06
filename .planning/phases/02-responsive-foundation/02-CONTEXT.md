# Phase 2: Responsive foundation - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Source:** Audit UX/QA 2026-05-12 + verification code Phase 1

<domain>
## Phase Boundary

Rendre l'application QualiOF utilisable sur mobile (390px iPhone) et tablette (768px iPad), pas seulement desktop. L'audit décrit :
- Sidebar `w-64` (256px) reste pleine largeur en mobile, couvre 65% de l'écran 390px
- Aucun menu hamburger
- Contenu décalé sous la sidebar en mobile/tablette

**Correction du diagnostic initial (CONCERNS.md) :**

L'analyse de Phase 1 affirmait que `tailwind.config.ts` avait `screens: { '2xl': '1400px' }` au top-level, supprimant les breakpoints par défaut. **C'était faux.** Vérification en lisant le fichier :

```ts
theme: {
  container: {
    center: true,
    padding: '2rem',
    screens: { '2xl': '1400px' },  // ← scope: container utility UNIQUEMENT
  },
  extend: { colors: ..., fontFamily: ... },
}
```

`screens` est dans **`theme.container.screens`**, donc il n'affecte que la max-width de la classe `container`. Les breakpoints Tailwind par défaut (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`) sont intacts.

**Vraie cause racine :** Sidebar (`apps/web/src/components/layout/sidebar.tsx`) et MainContent (`apps/web/src/components/layout/main-content.tsx`) utilisent des classes fixes (`w-64`, `ml-64`, `fixed`) **sans aucun variant responsive** (`hidden md:block`, `ml-0 md:ml-64`, etc.). Les breakpoints existent, ils ne sont juste pas utilisés.

</domain>

<decisions>
## Implementation Decisions

### RESP-01 — Audit tailwind.config.ts (révisé)

- Décision verrouillée : **Aucune modification de `tailwind.config.ts`** pour cette phase. Les breakpoints par défaut fonctionnent (le `screens` problématique est dans `container.screens`, scope limité).
- Décision verrouillée : Confirmer en runtime que `md:`, `lg:`, `xl:` fonctionnent via un test rapide (ajouter une classe `bg-red-500 md:bg-blue-500` sur un élément test, ouvrir devtools, redimensionner — couleur change à 768px).
- Si le test runtime échoue (peu probable) : retirer entièrement `theme.container.screens` ou normaliser via `theme.extend.screens`.
- Mettre à jour `CONCERNS.md` et `CLAUDE.md > Patterns to fix` pour corriger l'analyse erronée.

### RESP-02 — Sidebar responsive avec hamburger

- Décision verrouillée : Sur viewports ≥ `md` (768px) : sidebar fixe comme aujourd'hui (`hidden md:block` ou équivalent).
- Décision verrouillée : Sur viewports < `md` : sidebar cachée par défaut, accessible via bouton hamburger dans la TopBar.
- Décision verrouillée : Implémentation hamburger via **Radix Dialog en mode overlay drawer** (déjà dans `@radix-ui/react-dialog` v1 dans le package.json — vérifier la version) OU `Sheet` shadcn-style si déjà présent dans `components/ui/`.
- Décision verrouillée : L'icône hamburger (Lucide `Menu`) est ajoutée dans `TopBar` à GAUCHE du Cmd+K trigger, visible UNIQUEMENT en < md (`md:hidden`).
- Décision verrouillée : Le drawer mobile reprend EXACTEMENT le contenu de la sidebar desktop (réutiliser le composant `<Sidebar />` ou extraire les sections NAV en composant partagé).
- Décision verrouillée : Le drawer se ferme automatiquement quand l'utilisateur clique sur un lien de navigation (`router.push` → onOpenChange(false)).
- État `localStorage qualiof-sidebar-collapsed` reste **desktop-only** — pas de persistence du drawer mobile.

### RESP-03 — MainContent responsive

- Décision verrouillée : `MainContent` passe de `ml-64`/`ml-[64px]` à `ml-0 md:ml-64`/`md:ml-[64px]`. En mobile, le contenu prend toute la largeur (la sidebar étant absente/drawer).
- Décision verrouillée : La transition `transition-[margin-left]` reste, mais devient inutile en mobile (margin déjà 0).
- Décision verrouillée : Le wrapper `app/app/layout.tsx` n'est pas touché — Phase 1 a déjà retiré `min-h-screen` de MainContent.

### Implémentation responsive (cross-cutting)

- Décision verrouillée : Pas de refonte de la TopBar dans cette phase (Phase 4 s'en occupe). La TopBar reste `sticky top-0` desktop ; pour qu'elle marche en mobile, vérifier qu'elle n'est pas décalée par le `ml-64` absent.
- Décision verrouillée : Pas de refonte des contenus internes (KPI cards, tableaux). Phase 3 (RESP-04, RESP-05) gère le contenu.
- Décision verrouillée : Test QA visuel sur 4 tailles : 390px (iPhone SE), 768px (iPad portrait), 1024px (iPad landscape / petit laptop), 1440px (desktop standard). Sur 6 pages clés : dashboard, sessions list, session détail, apprenants list, apprenant détail, dossier OPCO détail.
- Décision verrouillée : Pas de skill `gstack`/`browse` automatisé pour ces captures ; Laurent valide à l'œil (économie de temps).

### Out of scope

- Refonte design system mobile (typo, espacements). Phase 6 a la cohérence visuelle.
- Optimisation perf mobile (lazy-load images, etc.).
- Touch gestures spécifiques (swipe pour fermer drawer, etc.) — bouton X + clic overlay suffit.
- PWA / app shell pattern.

### Claude's Discretion

- Choix entre Radix Dialog overlay vs Sheet shadcn — selon ce qui est plus naturel et plus propre.
- Position exacte du bouton hamburger (gauche du Cmd+K, ou à l'extrême gauche de la TopBar).
- Animation d'ouverture/fermeture du drawer (`slide-in-from-left` ou autre).
- Largeur du drawer mobile (peut être full-width ou 80% pour laisser voir un peu du contenu derrière).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase map

- `.planning/codebase/STACK.md` — Tailwind 3.4.17, Radix UI primitives en place
- `.planning/codebase/STRUCTURE.md` — Emplacement des composants layout
- `.planning/phases/01-smoke-verification-bugs-critiques/01-VERIFICATION.md` — État sortant Phase 1 (MainContent sans min-h-screen)

### Project context

- `.planning/PROJECT.md` — Active requirements RESP-01..03
- `.planning/REQUIREMENTS.md` — REQ-IDs exacts

### Files in scope (directly modified by this phase)

- `apps/web/tailwind.config.ts` — Audit only (probablement aucune modification)
- `apps/web/src/components/layout/sidebar.tsx` — Ajouter `hidden md:block` ou équivalent + extraction NAV
- `apps/web/src/components/layout/main-content.tsx` — `ml-0 md:ml-64`
- `apps/web/src/components/layout/top-bar.tsx` — Ajouter bouton hamburger `md:hidden`
- (Nouveau) `apps/web/src/components/layout/mobile-nav-drawer.tsx` — Drawer mobile (ou composant équivalent)
- `apps/web/src/app/app/layout.tsx` — Vérifier qu'aucune adaptation supplémentaire n'est requise
- `.planning/codebase/CONCERNS.md` — Corriger l'analyse erronée sur `screens`
- `CLAUDE.md` — Corriger ligne "❌ Tailwind `screens` overrides defaults" dans "Patterns to fix"

### Reference files (read only)

- `apps/web/src/components/ui/` — Vérifier si `dialog.tsx` ou `sheet.tsx` existent (composants Radix prêts à l'emploi)
- `apps/web/package.json` — Confirmer `@radix-ui/react-dialog`
- `apps/web/src/components/command-palette/command-palette.tsx` — Patron Radix Dialog existant
</canonical_refs>

<specifics>
## Specific Ideas

- **Pattern Radix Dialog en drawer** :
  ```tsx
  <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button className="md:hidden ...">
        <Menu className="h-5 w-5" />
      </button>
    </DialogTrigger>
    <DialogContent className="fixed inset-y-0 left-0 w-72 max-w-[80vw] p-0 ... data-[state=open]:animate-in slide-in-from-left">
      {/* contenu sidebar */}
    </DialogContent>
  </Dialog>
  ```

- **Sidebar refactor** : Extraire `NAV` array + le rendu en composant pur `<SidebarNav onNavigate={...} />`. Le `<Sidebar />` desktop wrap `<SidebarNav />` dans son `<aside fixed w-64>`. Le `<MobileNavDrawer />` wrap `<SidebarNav />` dans un `<DialogContent>` qui se ferme au clic.

- **Test sm/md/lg/xl actifs** : Ajouter temporairement dans une page (puis retirer) :
  ```tsx
  <div className="bg-red-500 sm:bg-green-500 md:bg-blue-500 lg:bg-yellow-500 xl:bg-purple-500 p-4">
    breakpoint test
  </div>
  ```
  Redimensionner browser de 320 → 1600 : couleurs changent à chaque breakpoint. Si oui → tailwind OK.

- **Bouton hamburger emplacement** : intégration TopBar :
  ```tsx
  <header className="h-14 border-b ... sticky top-0 z-10 gap-3 px-4 md:px-8">
    <button onClick={openMobileNav} className="md:hidden -ml-1 p-2 ...">
      <Menu className="h-5 w-5" />
    </button>
    <div className="flex-1 max-w-md"><CmdkTrigger /></div>
    {/* ... reste de la TopBar */}
  </header>
  ```

- **MainContent** :
  ```tsx
  // before
  collapsed ? 'ml-[64px]' : 'ml-64',
  // after
  collapsed ? 'ml-0 md:ml-[64px]' : 'ml-0 md:ml-64',
  ```

</specifics>

<deferred>
## Deferred Ideas

- **Swipe gestures** (swipe-to-close drawer) — deferred, UX nice-to-have v2
- **Sidebar scroll lock** quand le drawer mobile est ouvert — vérifié par Radix Dialog par défaut, à confirmer
- **Animations subtiles supplémentaires** (fade overlay, transitions sidebar item) — Phase 6 (a11y/polish)
- **Tableau de bord adapté mobile** (KPI cards reflow, listings → card view) — Phase 3 RESP-04/05
- **App mobile native ou PWA** — `MOBILE-01` dans v2 requirements
- **Test E2E responsive automatisé** (Playwright + viewport sizes) — `TEST-01` dans v2 requirements
</deferred>

---

*Phase: 02-responsive-foundation*
*Context gathered: 2026-05-12*
