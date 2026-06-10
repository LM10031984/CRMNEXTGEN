---
phase: quick-260525-j9d
plan: 01
subsystem: parametres
tags: [bugfix, rsc, next14, server-components, lucide-react]
requires:
  - apps/web/src/components/settings/settings-section.tsx (Client Component existant)
  - apps/web/src/app/app/parametres/page.tsx (Server Component existant)
provides:
  - SettingsSection signature compatible RSC (icon: ReactNode)
  - Page Paramètres fonctionnelle après pnpm dev:full
affects:
  - 11 sites d'appel SettingsSection dans parametres/page.tsx
tech-stack:
  added: []
  patterns:
    - "Server → Client prop sérialisable : pré-rendre le JSX côté Server au lieu de passer une référence de fonction"
key-files:
  created: []
  modified:
    - apps/web/src/components/settings/settings-section.tsx
    - apps/web/src/app/app/parametres/page.tsx
decisions:
  - "icon: ReactNode plutôt que icon: ComponentType pour garder les call sites concis et permettre n'importe quel JSX (pas seulement Lucide)"
  - "Constante locale ICON_CLASS dans page.tsx (DRY 11 occurrences) plutôt que default dans SettingsSection (le composant ne sait plus rien du styling de l'icône — séparation de responsabilité claire)"
metrics:
  duration: "~2 min"
  completed: "2026-05-25T11:56:54Z"
  tests_added: 0
  tests_passing: 4
  files_changed: 2
  lines_added: 16
  lines_removed: 18
---

# Quick 260525-j9d : Fix RSC error page Paramètres — SettingsSection icon Summary

Migration de `SettingsSection.icon` de `LucideIcon` (fonction React, non-sérialisable RSC) vers `ReactNode` (JSX pré-rendu côté Server Component) pour débloquer l'ouverture de `/app/parametres`.

## Root Cause

`apps/web/src/components/settings/settings-section.tsx` est marqué `'use client'` (il utilise `useState` pour basculer entre read/edit). Le `Server Component` parent (`parametres/page.tsx`) lui passait `icon={Building2}` — soit une **référence de fonction React** (`LucideIcon` = `ForwardRefExoticComponent<...>`, c'est-à-dire une fonction).

Or Next.js 14 App Router interdit le passage de fonctions via la frontière Server → Client (sérialisation impossible). Runtime error :

> Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.

Aucun test smoke ne détectait ça car le test charge le fichier comme string (analyse statique, pas d'exécution RSC).

## Fix Applied

### `settings-section.tsx` (Client)

- Suppression de l'import `type { LucideIcon }` (devenu inutile).
- `icon: LucideIcon` → `icon: ReactNode` dans `SettingsSectionProps`.
- Destructuration : `{ icon: Icon, ... }` → `{ icon, ... }` (plus d'alias).
- Usage interne : `<Icon className="..." aria-hidden="true" />` → `{icon}`.
- JSDoc préservé (toujours pertinent).

### `parametres/page.tsx` (Server)

- Ajout d'une constante locale `const ICON_CLASS = 'h-5 w-5 mt-0.5 text-primary shrink-0';` après les imports.
- 11 props `icon={X}` remplacés par `icon={<X className={ICON_CLASS} aria-hidden="true" />}` (Building2, MapPin, Image, Hash, Receipt, FileText, CreditCard, Mail, Users, Sparkles, Settings).
- Imports Lucide inchangés (les 11 icônes restent référencées en JSX inline).
- `<FileText className="h-3.5 w-3.5" />` ligne 459 (intra-table, hors SettingsSection) non touchée.

Le styling visuel est strictement identique (mêmes classes Tailwind, même `aria-hidden`).

## Verification

| Vérification | Résultat |
| --- | --- |
| `grep -c "icon={<" apps/web/src/app/app/parametres/page.tsx` | `11` (attendu : 11) |
| `grep -c "LucideIcon" apps/web/src/components/settings/settings-section.tsx` | `0` (attendu : 0) |
| `pnpm exec vitest run src/app/app/parametres/__tests__/page.smoke.test.ts` | `4/4` verts |
| `tsc --noEmit` sur fichiers touchés | `0` erreur (les 4 erreurs `veille-*` pré-existantes sont hors-périmètre, cf `deferred-items.md`) |
| `grep -rn "SettingsSection" apps/web/src --include="*.tsx"` (hors comments) | 1 seul consommateur (`parametres/page.tsx`) — aucun autre site à migrer |

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

4 erreurs TS / 4 fichiers de tests qui échouent au load à cause de modules manquants (`../veille-audit-template`, `../veille-export`). Pré-existantes, sans rapport avec ce fix. Documentées dans `deferred-items.md` du même dossier. À traiter dans un quick séparé.

## Validation Laurent (en attente)

1. `pnpm dev:full` (auto-clean `.next`).
2. Ouvrir <http://localhost:3000/app/parametres> en étant loggué.
3. Vérifier :
   - Plus de bandeau d'erreur runtime « Functions cannot be passed directly… ».
   - Les 11 cartes (Organisme, Adresse, Logo, Numérotation, Facturation relances, Documents légaux, Bancaires, Email, Utilisateurs, OPCO, Référentiel docs) s'affichent avec leur icône en haut-gauche (taille `h-5 w-5`, couleur `text-primary`).
   - Le bouton « Modifier » fonctionne sur les 8 sections éditables.

## Self-Check: PASSED

- FOUND: apps/web/src/components/settings/settings-section.tsx (modifié)
- FOUND: apps/web/src/app/app/parametres/page.tsx (modifié)
- FOUND: commit dde5d41 (`git log` confirmé)
- FOUND: 4/4 tests smoke verts (parametres/page.smoke.test.ts)
- FOUND: deferred-items.md (issues hors-scope tracées)
