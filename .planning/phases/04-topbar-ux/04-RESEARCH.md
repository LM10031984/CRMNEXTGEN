# Phase 4: TopBar UX - Research

**Researched:** 2026-05-13
**Status:** Research complete

## Phase Summary

Petite phase : UX-01 quasiment déjà fait (panel notifications Radix DropdownMenu opérationnel dans `notifications-bell.tsx`), UX-02 à faire (déconnexion dans dropdown avatar avec AlertDialog confirmation). 1 nouveau composant client `UserMenuButton.tsx` + modification mineure de `top-bar.tsx`.

## Findings par requirement

### UX-01 — Panel notifications

**État actuel (vérifié) :**
- Composant `apps/web/src/components/layout/notifications-bell.tsx` (~125 lignes) :
  - Trigger : bouton cloche Lucide `<Bell />` avec badge `total` rouge (99+ si > 99)
  - Content : Radix `DropdownMenu.Content` avec liste d'items
  - Source de données : `getNotifications()` server action, polling 60s
  - Item rendering : icône kind + label + chevron, lien vers la page drill-down, ferme dropdown au clic
  - État vide : message rassurant "Tout est en règle, rien à faire dans l'immédiat."
  - Sévérité : 3 niveaux (info/warning/danger) avec classes bg/border
- **Aucune action requise sur ce composant** (déjà conforme à l'attente de l'audit).

**Test à faire (manual) :**
- Cliquer la cloche : panel s'ouvre ✓
- Vérifier que le panel reste utilisable en viewport 390px (Phase 2 a livré drawer mobile, mais la cloche reste dans la TopBar) — devrait être OK car DropdownMenu Radix s'aligne à `align="end"` automatiquement.

### UX-02 — Déconnexion dans dropdown avatar

**État actuel :**
- `apps/web/src/components/layout/top-bar.tsx` rend :
  ```tsx
  <NotificationsBell />
  <div className="text-right text-xs">
    <div className="font-medium">{user.firstName} {user.lastName}</div>
    <div className="text-muted-foreground">{user.role}</div>
  </div>
  <div className="h-9 w-9 rounded-full ...">{initials}</div>
  <form action={logoutAction}>
    <button type="submit" className="text-xs ...">Déconnexion</button>
  </form>
  ```
- **Problème :** bouton "Déconnexion" texte direct, pas de confirm, exposé au clic accidentel.

**Fix proposé :**
- Nouveau composant client `apps/web/src/components/layout/user-menu-button.tsx` :
  - Trigger : tout le bloc {nom+role+avatar} devient cliquable, ouvre DropdownMenu Radix
  - Items :
    - Lien `Paramètres` → `/app/parametres`
    - Séparateur
    - Item `Déconnexion` (texte rouge) qui n'submit pas direct, mais ouvre un AlertDialog confirmation
  - AlertDialog : 2 boutons "Annuler" (cancel) + "Se déconnecter" (red destructive) qui submit le `<form action={logoutAction}>`
- Modification `top-bar.tsx` : remplace le bloc {NotificationsBell + nom + avatar + form logout} par `<NotificationsBell /> <UserMenuButton user={user} />` (composition propre)

**Patterns du repo réutilisés :**
- Radix DropdownMenu : `notifications-bell.tsx` et `session-actions-menu.tsx` (à vérifier)
- AlertDialog destructive : `apps/web/src/components/sessions/delete-session-button.tsx` (pattern Dialog Radix avec input de confirmation)
- Subcomponent client dans TopBar server : `mobile-menu-button.tsx` (Phase 2)

**Anti-patterns à éviter :**
- Ne pas mélanger DropdownMenu et Dialog dans la même `<Root>`. Utiliser 2 racines (DropdownMenu pour le menu, Dialog séparé pour la confirmation, ouvert via state `confirmOpen` géré par l'item Déconnexion).
- Ne pas oublier `e.preventDefault()` dans le `onSelect` de l'item Déconnexion (sinon le DropdownMenu se referme avant que le Dialog ne s'ouvre, et il faut gérer le focus return).

### Pitfalls cross-cutting

1. **TopBar reste Server Component** — ne pas le rendre client. Le user prop est passé depuis layout.tsx (server). Le `<UserMenuButton user={user} />` est client mais reçoit user sérialisable comme prop. Le `<form action={logoutAction}>` à l'intérieur du Dialog appelle une server action — valide pattern Next 14.

2. **Sticky header (Phase 1)** ne doit pas casser. Le `<UserMenuButton>` rendu inline dans `<header sticky top-0 z-10>` n'affecte pas le contexte sticky. OK.

3. **Z-index** — DropdownMenu Radix par défaut `z-50` sur le Content. AlertDialog (Dialog) overlay `z-40` + content `z-50`. Le DropdownMenu se ferme automatiquement quand le Dialog s'ouvre (cascade modale), donc pas de conflit Z.

4. **Mobile** — En 390px (drawer mobile sidebar livré Phase 2), la TopBar a déjà `<MobileMenuButton />` au début. Le `<UserMenuButton />` reste à la fin, devrait fit. Vérifier que `firstName + lastName + role` text ne casse pas le layout en très mobile — solution : ces infos sont `hidden sm:block` (texte caché < 640px), seul l'avatar reste cliquable. En mobile, l'avatar ouvre le menu, et le menu contient le nom+role au top.

5. **Lucia logout** — `logoutAction` est une server action qui delete la session Lucia + `redirect('/login')`. Le pattern `<form action={logoutAction}>` est standard Next 14 server actions. Doit rester dans un `<form>` (pas un bouton onClick) pour bénéficier de la submit semantics + redirect.

## Validation Architecture

> Pour `04-VALIDATION.md` Nyquist.

**Dimensions critiques :**

### 1. Notifications panel fonctionne
- Type : Visual + DevTools
- Acceptance : Clic cloche → panel s'ouvre. Items affichés (ou message vide). Clic item → navigate. Panel se ferme.
- Coverage : 1 test manuel rapide

### 2. UserMenuButton remplace bloc avatar+logout
- Type : Code grep + visual
- Acceptance :
  - `top-bar.tsx` ne contient plus `<form action={logoutAction}>` (grep négatif)
  - `top-bar.tsx` contient `<UserMenuButton`
  - Nouveau fichier `user-menu-button.tsx` créé
- Coverage : grep + ouverture du fichier

### 3. Déconnexion avec confirmation
- Type : Visual
- Acceptance : Clic avatar → menu dropdown s'ouvre. Clic "Déconnexion" → AlertDialog. Clic "Annuler" → ferme. Clic "Se déconnecter" → submit form, redirect /login.
- Coverage : 1 test manuel

### 4. Aucune régression Phase 1+2+3
- Type : Auto + visual
- Acceptance : Build OK, smoke test 2/2, sticky header OK, sidebar drawer mobile OK.

### Threshold

Phase 4 = SUCCESS si :
- Code grep pass (UserMenuButton créé + intégré, form logout retiré du JSX direct)
- Build OK
- Smoke régression Phase 1 OK
- Test manuel "ouvrir menu user + tenter déconnexion + annuler + retry confirmer" passe

## Recommendations for planner

1. Granularité : 3 plans
   - 04-01 : Vérifier panel notifications (1 task, 5 min)
   - 04-02 : Créer UserMenuButton + AlertDialog confirmation
   - 04-03 : Intégrer dans top-bar.tsx (remplacer bloc avatar+logout)
   - 04-04 : Bookkeeping wave 2

2. Files modified :
   - 04-02 : NEW `apps/web/src/components/layout/user-menu-button.tsx`
   - 04-03 : `apps/web/src/components/layout/top-bar.tsx`

3. Wave : 04-01, 04-02, 04-03 en wave 1 (04-03 dépend de 04-02 mais peuvent enchaîner) → en fait 04-03 dépend de 04-02 donc 04-02 wave 1, 04-03 wave 2, 04-04 wave 3. Ou plus simple : tout sequentiel wave 1 dans l'ordre 02 → 03 → 04 → bookkeeping.

   Choisir : wave 1 = {04-01 (audit notif), 04-02 (créer UserMenuButton)} parallèles, wave 2 = {04-03 (intégrer)}, wave 3 = {04-04 (bookkeeping)}.

4. must_haves : panel notifications fonctionne + déconnexion protégée avec dropdown + confirm.

---

## RESEARCH COMPLETE

*Phase: 04-topbar-ux*
*Researched: 2026-05-13*
