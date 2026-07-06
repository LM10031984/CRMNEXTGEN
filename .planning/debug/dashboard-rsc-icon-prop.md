---
status: awaiting_human_verify
trigger: "Régression Phase 7 smoke test — page /app crash RSC: Functions cannot be passed directly to Client Components (icon={BarChart3} → CollapsibleSection 'use client')"
created: 2026-05-15T00:00:00Z
updated: 2026-05-16T00:00:00Z
---

## Current Focus

hypothesis: 2ème call site CORRIGÉ. Refactor de la chaîne layout → Sidebar/TopBar/MobileMenuButton/MobileNavDrawer : prop `nav: NavSection[]` (non sérialisable car contient des fonctions Lucide) remplacée par `role: UserRole` (string sérialisable). Chaque Client Component importe `NAV` + `filterNavForRole` localement et filtre côté client.
test: tsc --noEmit (apps/web) → exit=0. Aucun autre call site du même anti-pattern dans le projet. Test nav-config.test.ts non impacté.
expecting: Plus aucun warning RSC "Only plain objects..." / "Functions cannot be passed..." sur la nav sidebar. Sidebar rendue avec son CSS complet (logo Q, sections, icônes Lucide à gauche). Filtrage par rôle conservé (D-07). a11y préservée.
next_action: Attendre confirmation humaine (`pnpm dev:full` + ouverture /app authentifié) puis archiver la session et appender au knowledge base.

## Symptoms

expected: La page d'accueil dashboard `/app` charge normalement (validation smoke test fin de Phase 7).
actual: Overlay Next.js: "Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with 'use server'. Or maybe you meant to call this function rather than return it. {$$typeof: ..., render: function ChartColumn}". Code 3504977742.
errors: Functions cannot be passed directly to Client Components ... function ChartColumn (alias interne Lucide pour BarChart3).
reproduction: Démarrer pnpm dev:full depuis files/, ouvrir http://localhost:3002/app connecté.
started: Apparu pendant smoke test Phase 7 (2026-05-15). Phase 6 avait enrichi CollapsibleSection a11y — possible régression masquée jusqu'au smoke.

## Eliminated

- hypothesis: Le 1er fix (CollapsibleSection + page.tsx ligne 151 ChartColumn) suffit à résoudre l'erreur RSC pour /app.
  evidence: Logs serveur post-restart propre montrent un 2ème warning du même pattern, sur un objet différent `{label, href: "/app", icon: {render: function LayoutDashboard}}` — c'est l'item "Tableau de bord" de la nav sidebar, pas l'icône BarChart3 du dashboard. Sidebar rendue sans CSS = composant Sidebar crashe à hydratation.
  timestamp: 2026-05-16T00:00:00Z

## Evidence

- timestamp: 2026-05-15T00:00:00Z
  checked: apps/web/src/components/ui/collapsible-section.tsx ligne 1
  found: Le fichier commence par `'use client';`. C'est bien un Client Component.
  implication: Toutes ses props traversent la frontière RSC→Client et doivent être sérialisables.

- timestamp: 2026-05-15T00:00:00Z
  checked: apps/web/src/components/ui/collapsible-section.tsx ligne 17
  found: `icon?: React.ComponentType<{ className?: string }>;` — la prop attend une référence de fonction-composant (non sérialisable).
  implication: Même un ReactNode déjà rendu serait refusé par cette signature en TS strict. Il faut la changer pour `React.ReactNode`.

- timestamp: 2026-05-15T00:00:00Z
  checked: apps/web/src/components/ui/collapsible-section.tsx ligne 82
  found: `{Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}` — l'icône est instanciée côté Client avec son className et aria-hidden.
  implication: Si on passe un ReactNode déjà instancié, ce sera au caller (Server Component) d'appliquer le className et aria-hidden. C'est OK : Lucide accepte ces props côté serveur, et le résultat est un `<svg>` sérialisable.

- timestamp: 2026-05-15T00:00:00Z
  checked: apps/web/src/app/app/page.tsx ligne 27
  found: `export default async function DashboardPage(...)` — pas de directive `'use client'`. Async function exportée par défaut depuis un fichier `app/.../page.tsx`. C'est un Server Component (RSC).
  implication: Confirme que la frontière RSC→Client est traversée à la ligne 147-211.

- timestamp: 2026-05-15T00:00:00Z
  checked: apps/web/src/app/app/page.tsx ligne 151
  found: `icon={BarChart3}` — passage de la référence de fonction (composant Lucide non instancié).
  implication: BarChart3 est aliasé en interne par Lucide en `ChartColumn` (cf. l'erreur affichée). Cette fonction non marquée `'use server'` est rejetée par le sérialiseur RSC de Next.js 14.2.35.

- timestamp: 2026-05-15T00:00:00Z
  checked: grep "CollapsibleSection" récursif sur apps/web/src
  found: Un seul vrai call site du composant — app/app/page.tsx:147. Les autres hits dans sidebar-nav.tsx (lignes 57-65) sont des références à une variable locale nommée `isCollapsibleSection`, sans rapport avec le composant `<CollapsibleSection>`.
  implication: Le changement de signature de la prop `icon` est sûr — aucun autre caller à mettre à jour. Pas de régression à craindre ailleurs.

- timestamp: 2026-05-16T00:00:00Z
  checked: apps/web/src/components/layout/nav-config.ts lignes 22-25
  found: `interface NavItem { label: string; href: string; icon: React.ComponentType<{ className?: string }>; ... }` — la nav config stocke des références de fonctions Lucide (LayoutDashboard, Calendar, Users, Inbox, ClipboardCheck, Receipt, Wallet, Megaphone, Building2, GraduationCap, BookOpen, FileText, Landmark, ListChecks, Settings, UserCog, History).
  implication: Tout passage de `NavSection[]` à travers une frontière RSC→Client viole le sérialiseur Next 14. Confirme le 2ème call site.

- timestamp: 2026-05-16T00:00:00Z
  checked: apps/web/src/components/layout/sidebar.tsx ligne 1
  found: `'use client';` en tête. Composant Client qui reçoit `nav: NavSection[]` en prop (ligne 19) depuis un Server Component (layout.tsx).
  implication: C'est la frontière RSC→Client violée pour la sidebar desktop.

- timestamp: 2026-05-16T00:00:00Z
  checked: apps/web/src/components/layout/top-bar.tsx (avant fix)
  found: Pas de 'use client' (Server Component) mais reçoit `nav: NavSection[]` en prop et le passe à `<MobileMenuButton nav={nav}>` qui est lui-même `'use client'`.
  implication: 2ème chemin de la même violation, pour la nav mobile.

- timestamp: 2026-05-16T00:00:00Z
  checked: apps/web/src/app/app/layout.tsx ligne 27-33 (avant fix)
  found: `const visibleNav = filterNavForRole(NAV, user.role as UserRole);` puis `<Sidebar nav={visibleNav} />` et `<TopBar user={user} nav={visibleNav} />`. Le layout est Server (async function), il sérialise `visibleNav` (NavSection[] contenant des fonctions Lucide) vers deux Client Components.
  implication: La cause racine du 2ème warning. Le fix doit retirer ce passage de prop pour ne plus traverser la frontière avec des fonctions.

- timestamp: 2026-05-16T00:00:00Z
  checked: grep "icon:" sur apps/web/src/app/app/**/*.tsx (autres call sites potentiels)
  found: Tous les autres `icon: Icon` dans les pages Server (page.tsx budget-agefice, dossiers-opco, financeurs, factures, organisations, etc.) sont des destructuring params de helpers internes rendus côté Server (PageHeader, StatCard, etc.) — pas de prop passée à un Client Component. STATUS_LABEL dans preinscriptions/page.tsx est consommé localement dans le rendu Server (ligne 108 `const Icon = s?.icon ?? Inbox; ... <Icon className=... />` côté Server).
  implication: Aucun autre call site du même anti-pattern. Le scope du fix est limité à la chaîne layout → Sidebar/TopBar/MobileMenuButton/MobileNavDrawer.

- timestamp: 2026-05-16T00:00:00Z
  checked: grep des imports de `<Sidebar>`, `<TopBar>`, `<MobileMenuButton>`, `<MobileNavDrawer>`
  found: Un seul consommateur pour chacun : Sidebar et TopBar importés par `app/app/layout.tsx` ; MobileMenuButton importé par `top-bar.tsx` ; MobileNavDrawer importé par `mobile-menu-button.tsx`. Aucun usage externe à ce chemin.
  implication: Refactor de prop `nav: NavSection[]` → `role: UserRole` sûr — pas d'autre call site à mettre à jour.

- timestamp: 2026-05-16T00:00:00Z
  checked: apps/web/src/components/layout/__tests__/nav-config.test.ts
  found: Le test importe `NAV` + `filterNavForRole` + `type NavSection` et inspecte uniquement `items.map(i => i.href)`. Aucune dépendance à l'API qui change (les props des composants Sidebar/TopBar/MobileMenuButton/MobileNavDrawer).
  implication: Aucun test à mettre à jour.

- timestamp: 2026-05-16T00:00:00Z
  checked: `pnpm exec tsc --noEmit` dans apps/web après refactor
  found: exit=0, zéro erreur de type (strict + noUncheckedIndexedAccess respectés).
  implication: Le refactor est typesafe — UserRole bien transmis, useMemo bien typé, NavSection toujours utilisé en interne par SidebarNav.

## Resolution

root_cause: |
  DEUX call sites distincts du même anti-pattern « passer une fonction-composant Lucide à travers la frontière RSC→Client ».

  1) (1er fix 2026-05-15) `DashboardPage` (Server, apps/web/src/app/app/page.tsx:151) passait `icon={BarChart3}` (référence de fonction, alias Lucide interne `ChartColumn`) au composant Client `CollapsibleSection` typé `React.ComponentType`. Erreur RSC code 3504977742 sur /app.

  2) (2ème fix 2026-05-16) `AppLayout` (Server, apps/web/src/app/app/layout.tsx) appelait `filterNavForRole(NAV, user.role)` puis passait `visibleNav: NavSection[]` en prop à `<Sidebar>` ('use client') et `<TopBar>` qui le transmettait à `<MobileMenuButton>` ('use client') → `<MobileNavDrawer>` ('use client'). Chaque `NavItem` contient `icon: React.ComponentType` (LayoutDashboard, Calendar, Users, Inbox, ClipboardCheck, Receipt, Wallet, Megaphone, Building2, GraduationCap, BookOpen, FileText, Landmark, ListChecks, Settings, UserCog, History). Warning RSC "Only plain objects can be passed... Functions cannot be passed directly to Client Components" + crash de la Sidebar à hydratation (sidebar rendue en flow vertical sans CSS) + boucles Fast Refresh + exit code 0 de `pnpm dev`.

  Next 14 refuse de sérialiser des fonctions à travers la frontière RSC→Client sauf si elles sont marquées `'use server'`. Les composants Lucide sont des fonctions React standards, donc rejetés.
fix: |
  1er fix (2026-05-15) — collapsible-section + page dashboard :
    - `collapsible-section.tsx` : signature prop `icon` `React.ComponentType` → `React.ReactNode`.
    - `app/app/page.tsx` ligne 151 : `icon={BarChart3}` → `icon={<BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}`.

  2ème fix (2026-05-16) — chaîne layout → sidebar/topbar :
    - Au lieu de pré-filtrer `NAV` côté Server et passer `NavSection[]`, passer uniquement `role: UserRole` (string sérialisable) aux Client Components.
    - Chaque Client Component (`Sidebar`, `MobileNavDrawer`) importe localement `NAV` + `filterNavForRole` et calcule sa propre vue filtrée via `useMemo(() => filterNavForRole(NAV, role), [role])`. Les fonctions Lucide restent dans le bundle Client (import direct), jamais sérialisées.
    - `MobileMenuButton` reçoit `role` et le transmet à `MobileNavDrawer`. `TopBar` reçoit `user` (déjà sérialisable, c'est l'objet User Lucia) et passe `user.role as UserRole` à `MobileMenuButton`.
    - `AppLayout` n'importe plus `NAV` ni `filterNavForRole` — il extrait juste `role` de `user` et le passe en bas.
verification: |
  1er fix :
    - tsc --noEmit (apps/web) : exit 0.
    - Recompilation Next dev confirmée, aucune erreur de build.
    - GET /app sans cookie : HTTP 307 → /login (middleware auth opérationnel).
    - Grep "CollapsibleSection" : un seul vrai call site.
    - a11y préservée (`h-4 w-4 text-muted-foreground` + `aria-hidden="true"`).

  2ème fix :
    - tsc --noEmit (apps/web) après refactor : exit 0, zéro erreur de type (strict + noUncheckedIndexedAccess).
    - Grep imports `<Sidebar>`/`<TopBar>`/`<MobileMenuButton>`/`<MobileNavDrawer>` : un seul consommateur pour chaque (app/app/layout.tsx, top-bar.tsx, mobile-menu-button.tsx) — tous mis à jour.
    - Grep autres patterns `icon:` dans pages Server : aucun autre call site qui traverse une frontière RSC→Client (tous les autres sont des destructuring params consommés localement dans le rendu Server).
    - Test `nav-config.test.ts` non impacté (consomme `NAV` + `filterNavForRole` qui sont inchangés).
    - a11y préservée : `<Icon className="h-4 w-4 shrink-0" />` toujours appliqué dans `sidebar-nav.tsx` ligne 118 ; menu hamburger `aria-label="Ouvrir le menu"` ligne 26 ; drawer `Dialog.Title sr-only "Navigation principale"` ligne 46.
    - Sécurité D-07 préservée : `filterNavForRole` toujours appelé (juste déplacé côté client), filtre visuel par rôle reste opérationnel pour Sidebar desktop ET MobileNavDrawer. La vraie sécurité reste `requireRole` côté server actions (D-08), inchangée.
    - Comportement collapsed/sectionOpen/onNavigate de `SidebarNav` inchangé (il garde sa prop `nav` reçue de ses parents Client).

  RESTE À VÉRIFIER PAR L'HUMAIN : démarrage `pnpm dev:full`, ouverture /app authentifié, absence de l'overlay d'erreur Next ET du warning `[next] Warning: Only plain objects...` dans la console serveur, sidebar rendue avec son CSS (Q logo, sections Essentiel/Suivi/Configuration, icônes Lucide visibles à gauche de chaque item), filtrage par rôle correct (LECTEUR ne voit pas Utilisateurs/Historique/Paramètres), drawer mobile (< md) montre la même liste, plus de cycle Fast Refresh full reload.
files_changed:
  - apps/web/src/components/ui/collapsible-section.tsx (1er fix — signature prop icon ComponentType → ReactNode, destructuring sans alias, rendu direct {icon}, jsdoc explicatif sur la contrainte RSC→Client)
  - apps/web/src/app/app/page.tsx (1er fix — call site icon={BarChart3} → icon={<BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />})
  - apps/web/src/components/layout/sidebar.tsx (2ème fix — prop `nav: NavSection[]` → `role: UserRole`, import local de NAV + filterNavForRole, useMemo pour filtrer côté client)
  - apps/web/src/components/layout/top-bar.tsx (2ème fix — retrait de la prop `nav`, passage de `user.role as UserRole` à MobileMenuButton)
  - apps/web/src/components/layout/mobile-menu-button.tsx (2ème fix — prop `nav: NavSection[]` → `role: UserRole`, transmise au drawer)
  - apps/web/src/components/layout/mobile-nav-drawer.tsx (2ème fix — prop `nav: NavSection[]` → `role: UserRole`, import local de NAV + filterNavForRole, useMemo pour filtrer côté client puis nav passée à SidebarNav)
  - apps/web/src/app/app/layout.tsx (2ème fix — retrait de l'import + appel de filterNavForRole côté Server, passage de `role` au lieu de `visibleNav` à Sidebar et retrait de la prop nav sur TopBar)
