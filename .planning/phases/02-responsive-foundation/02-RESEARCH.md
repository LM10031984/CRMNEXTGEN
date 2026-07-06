# Phase 2: Responsive foundation - Research

**Researched:** 2026-05-12
**Status:** Research complete

## Phase Summary

Rendre QualiOF utilisable sur mobile (390px) et tablette (768px). 3 requirements ; le diagnostic initial (Tailwind `screens` qui override les défauts) **était erroné** — la vraie cause est que les composants layout n'utilisent simplement aucun variant responsive. Pas de modification Tailwind nécessaire ; il faut ajouter `hidden md:block`, `ml-0 md:ml-64`, et un drawer hamburger.

## Findings par requirement

### RESP-01 — Audit tailwind.config.ts

**Constat code (correction de l'analyse Phase 1) :**
- `apps/web/tailwind.config.ts:11` : `screens: { '2xl': '1400px' }` est dans **`theme.container.screens`**, pas `theme.screens`
- Conséquence : seule la classe `container` est affectée (sa max-width devient 1400px à partir du breakpoint 2xl). Les breakpoints `sm: 640`, `md: 768`, `lg: 1024`, `xl: 1280`, `2xl: 1536` restent intacts (défauts Tailwind 3).

**Test de validation runtime :**
```tsx
// Ajout temporaire dans n'importe quelle page rendue
<div className="bg-red-500 sm:bg-green-500 md:bg-blue-500 lg:bg-yellow-500 xl:bg-purple-500 p-4">
  breakpoint test
</div>
```
Redimensionner browser : la couleur doit changer à 640 / 768 / 1024 / 1280. Si c'est le cas → breakpoints OK.

**Que faire :**
- Aucune modification de `tailwind.config.ts` attendue.
- Si le test fail (improbable) : retirer `theme.container.screens` ou normaliser via `theme.extend.screens`.
- Mettre à jour `.planning/codebase/CONCERNS.md` (sections #4 #5) et `CLAUDE.md > Patterns to fix` pour corriger l'analyse erronée.

### RESP-02 — Sidebar responsive avec hamburger drawer

**Constat code :**
- `apps/web/src/components/layout/sidebar.tsx` (258 lignes) : composant `<Sidebar />` returns `<aside fixed top-0 left-0 h-screen w-64 ...>` (probablement — à confirmer en lisant le return). Aucun variant `md:`/`lg:`.
- Pas de drawer/sheet primitive dans `components/ui/`.
- `@radix-ui/react-dialog@1.1.4` déjà installé (cf. `apps/web/package.json`).
- Pattern Radix Dialog déjà utilisé : `apps/web/src/components/sessions/delete-session-button.tsx` (`import * as Dialog from '@radix-ui/react-dialog'`).

**Approche recommandée :**
1. **Refactor NAV** : extraire la déclaration `const NAV: NavSection[] = [ ... ]` du fichier `sidebar.tsx` dans un module dédié (`apps/web/src/components/layout/nav-config.ts`). Crée un composant `<SidebarNav>` qui rend les liens depuis `NAV` (avec ou sans icônes selon `collapsed`).
2. **Sidebar desktop** reste un `<aside className="hidden md:block fixed ...">` qui wrap `<SidebarNav />`.
3. **MobileNavDrawer** nouveau composant client `apps/web/src/components/layout/mobile-nav-drawer.tsx` :
   - Utilise `Dialog.Root` + `Dialog.Trigger` + `Dialog.Portal` + `Dialog.Overlay` + `Dialog.Content` Radix.
   - `Dialog.Content` positionné `fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-background border-r`.
   - Animation Tailwind : `data-[state=open]:animate-in slide-in-from-left data-[state=closed]:animate-out slide-out-to-left` (déjà supporté par `tailwindcss-animate` présent dans le repo).
   - Renderise `<SidebarNav onNavigate={() => setOpen(false)} />` — chaque clic ferme automatiquement.
4. **TopBar** : ajoute un bouton hamburger Lucide `<Menu />` au début du flex, `className="md:hidden ..."`. Au clic → ouvre MobileNavDrawer.

**Anti-patterns à éviter :**
- Ne pas créer un nouveau context React pour le drawer — un `useState` local dans TopBar suffit (passe `open`/`onOpenChange` en props au MobileNavDrawer).
- Ne pas dupliquer le code du NAV. Si la sidebar bouge, le drawer bouge avec.
- Ne pas tenter de garder la sidebar `fixed w-64` visible en mobile avec `transform`. C'est plus simple de la cacher et d'avoir un drawer dédié.

**État `localStorage qualiof-sidebar-collapsed` :**
- Reste desktop-only. Le MobileNavDrawer n'a pas de mode "collapsed" — soit ouvert, soit fermé.
- Au resize cross-breakpoint, le drawer ouvert peut rester monté (Radix gère ça proprement avec `data-state`).

### RESP-03 — MainContent responsive

**Constat code :**
- `apps/web/src/components/layout/main-content.tsx` : `<div className={cn('flex flex-col transition-[margin-left] duration-200', collapsed ? 'ml-[64px]' : 'ml-64')}>` (après Phase 1, plus de `min-h-screen`).
- Au mobile, `ml-64` décale le contenu de 256px à droite alors que la sidebar y est invisible.

**Fix :**
```tsx
collapsed ? 'ml-0 md:ml-[64px]' : 'ml-0 md:ml-64',
```

Cela conserve le comportement desktop (margin selon collapsed) et neutralise le margin en mobile.

**Anti-pattern :**
- Ne pas mettre `ml-64 md:ml-0` (l'inverse). Tailwind est mobile-first — le base style sans préfixe = mobile, le préfixe `md:` ajoute le style à partir de 768px.

## Pitfalls cross-cutting

1. **TopBar `sticky top-0`** — Phase 1 a stabilisé sticky en retirant `min-h-screen` de MainContent. **Ne pas régresser** : ne pas remettre `min-h-screen` sur MainContent, ne pas changer la position de la TopBar dans cette phase (Phase 4 s'occupera des actions topbar).

2. **Z-index** — La sidebar mobile drawer ouvre via Radix Dialog qui par défaut `z-50` sur l'overlay et le content. La TopBar `sticky z-10` reste en-dessous → le drawer mobile recouvre la TopBar (souhaité).

3. **Scroll lock** — Radix Dialog bloque automatiquement le scroll de la page quand il est ouvert (via `aria-hidden` + body scroll lock). Vérifier qu'aucun parent custom n'override ce comportement.

4. **Hot reload de tailwind.config.ts** — Si on doit toucher (a priori non), il faut redémarrer le dev server, hot reload ne le voit pas toujours.

5. **CSS purge** — Tailwind purge les classes inutilisées en build. Les classes dynamiques `cn(... 'md:' ...)` doivent être expressions complètes (pas string concat). Le pattern `cn(..., collapsed ? 'md:ml-[64px]' : 'md:ml-64')` est OK.

6. **SSR du Sidebar collapsed state** — `Sidebar` lit `localStorage` côté client uniquement. Le rendu initial SSR montre toujours `collapsed = false`. C'est OK : flash imperceptible (la sidebar est cachée en mobile de toute façon).

## Validation Architecture

> Cette section informe la création de `02-VALIDATION.md` (Nyquist Dimension 8).

**Dimensions critiques à valider pour Phase 2 :**

### 1. Breakpoints Tailwind opérationnels
- **Type :** Test manuel rapide (élément temporaire + redimensionnement browser)
- **Acceptance :** Couleur du div test change à 640 / 768 / 1024 / 1280 / 1536 px
- **Coverage :** 1 capture devtools pendant le test (puis retirer le div)
- **Frequency :** Une fois cette phase

### 2. Sidebar absente en mobile
- **Type :** Test manuel + DevTools (Inspect)
- **Acceptance :** En < 768px, `<aside>` sidebar a `display: none` (computed style). Bouton hamburger visible en TopBar.
- **Coverage :** Captures dashboard / sessions list en 390px

### 3. Drawer mobile ouvre et navigue
- **Type :** Test manuel interactif
- **Acceptance :** Clic sur hamburger → drawer ouvre, contenu navigation visible. Clic sur un item → drawer ferme + nouvelle page rendue.
- **Coverage :** Vidéo courte ou captures séquence drawer-open / page-after-nav

### 4. MainContent prend toute la largeur en mobile
- **Type :** Test manuel DevTools
- **Acceptance :** En < 768px, `<div MainContent>` a `margin-left: 0px` (computed). En ≥ 768px, margin reprend `64px` ou `256px` selon collapsed.
- **Coverage :** Captures avec annotations DevTools sur 2 viewports

### 5. Aucune régression desktop ≥ 768px
- **Type :** Test manuel
- **Acceptance :** Sur 1024px / 1440px : sidebar visible comme avant, bouton hamburger ABSENT, MainContent margin correcte selon collapsed state.
- **Coverage :** Captures sur 2 viewports

### Validation success threshold

Phase 2 = SUCCESS si :
- Breakpoint test passe
- 4 viewports clés (390 / 768 / 1024 / 1440) montrent un layout correct sur dashboard et sessions list
- Aucune régression sur desktop par rapport à Phase 1
- Drawer mobile s'ouvre + ferme + navigue sans bug

Phase 2 = FAILED si :
- Sidebar reste visible en mobile (CSS responsive non appliquée)
- Drawer pas atteignable depuis TopBar
- MainContent reste `ml-64` en mobile
- Une zone du contenu cachée derrière le drawer ouvert (overlay manquant)

## Recommendations for planner

1. **Granularité plans :** 3 plans wave 1 (parallélisables, files disjoints) + 1 plan wave 2 (bookkeeping).
2. **Ordre suggéré :**
   - Plan 02-01 : RESP-01 audit + correction docs (court, ne touche pas le code)
   - Plan 02-02 : RESP-02 sidebar + drawer (gros plan : extraction NAV + nouveau composant)
   - Plan 02-03 : RESP-03 MainContent (1 ligne)
   - Plan 02-04 : update REQUIREMENTS.md + ROADMAP.md (bookkeeping)
3. **Files_modified par plan :**
   - 02-01 : `.planning/codebase/CONCERNS.md`, `CLAUDE.md`
   - 02-02 : `sidebar.tsx`, `top-bar.tsx`, NOUVEAU `mobile-nav-drawer.tsx`, NOUVEAU `nav-config.ts`
   - 02-03 : `main-content.tsx`
   - 02-04 : `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`
4. **Dépendances :** Plan 02-04 depends_on [02-01, 02-02, 02-03]. Les 3 autres sont parallèles.
5. **must_haves :** Les 4 success criteria de la roadmap.

---

## RESEARCH COMPLETE

*Phase: 02-responsive-foundation*
*Researched: 2026-05-12*
