# Phase 4: TopBar UX - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Combler les 2 frictions visibles sur la TopBar identifiées par l'audit UX/QA 2026-05-12.

**Découverte en relisant le code (correction d'analyse) :**

- **UX-01 (panneau notifications)** : `apps/web/src/components/layout/notifications-bell.tsx` (~125 lignes) implémente **déjà** un panneau Radix DropdownMenu complet avec items, icônes Lucide, badges sévérité (info/warning/danger), liens cliquables vers les pages concernées (`/app/preinscriptions`, `/app/sessions?filter=...`, `/app/apprenants?filter=cleanup`), polling toutes les 60s. **L'audit "On ne sait pas ce qu'il y a derrière" est obsolète** : soit l'auditeur a survolé sans cliquer la cloche, soit le panneau a été livré entre audit et today. À vérifier + petit polish.
- **UX-02 (déconnexion exposée)** : confirmé. `apps/web/src/components/layout/top-bar.tsx` a un `<form action={logoutAction}>` direct dans le header, à coté de l'avatar utilisateur. Risque de clic accidentel + pas de confirmation.

**Particularité notifications :** Les "notifications" QualiOF sont des **alertes dérivées** (pré-inscriptions en attente, sessions sans participants, sessions à clôturer, fiches à nettoyer) — calculées en temps réel par `server/actions/notifications.ts:getNotifications()`. Ce ne sont PAS des entrées en base persistées. Donc :
- "Marquer comme lu" n'a pas de sens (l'alerte disparaît quand sa condition est résolue)
- "Tout voir" n'a pas vraiment de page cible unique (chaque type d'alerte a son drill-down)

</domain>

<decisions>
## Implementation Decisions

### UX-01 — Panel notifications (déjà 90% en place)

- Décision verrouillée : **Ne pas changer la nature** (alertes dérivées, pas notif persistées). Pas de "Marquer comme lu" / "Tout voir" page car non pertinents.
- Décision verrouillée : **Polish léger seulement** :
  - Vérifier que le DropdownMenu affiche bien en mobile (test viewport 390px — Phase 2 a livré le drawer hamburger, vérifier que la cloche reste visible et clic OK).
  - Ajouter un message d'aide subtile quand vide : déjà fait ("Tout est en règle, rien à faire dans l'immédiat.").
  - Vérifier que le badge `total` est cohérent avec les items rendus (`items.length === total` ou `total >= items.length` selon design).

### UX-02 — Déconnexion dans dropdown avatar

- Décision verrouillée : **Remplacer** le `<form action={logoutAction}>` direct par un Radix DropdownMenu déclenché par l'avatar.
- Décision verrouillée : Items du DropdownMenu :
  - **Profil** (placeholder vers `/app/parametres` ou `#` — pas de page profil dédiée encore)
  - **Paramètres** → `/app/parametres`
  - séparateur
  - **Déconnexion** → ouvre `AlertDialog` Radix de confirmation : "Confirmer la déconnexion ?" → bouton "Annuler" (cancel) / bouton "Se déconnecter" (rouge destructive) → submit le form `logoutAction`.
- Décision verrouillée : Le composant client encapsule tout (state du dropdown + state du AlertDialog) car `<form action={logoutAction}>` est une server action (peut être appelée depuis client).
- Décision verrouillée : Avatar = trigger. Toujours visible (cliquer l'avatar = ouvrir menu). Affichage user firstName + lastName + role restent à droite de l'avatar (info immédiate).
- Décision verrouillée : Garder le pattern client-only (TopBar reste server component — le UserDropdown est un client subcomponent comme `MobileMenuButton`).

### Out of scope

- Page Profil dédiée (édition photo, mot de passe, préférences user) — futur milestone (RBAC en Phase 8 traitera la gestion users côté admin).
- Notifications persistées + "Marquer comme lu" — futur, demande un modèle Prisma `Notification` et write path.
- Push notifications / SMS — explicitement out of scope dans PROJECT.md.
- Refonte de l'icône avatar (placeholder image) — Phase 6 polish.

### Claude's Discretion

- Style exact du dropdown avatar (largeur, alignment).
- Wording exact du AlertDialog confirmation.
- Si Profil placeholder visible (grisé "À venir") ou caché.
</decisions>

<canonical_refs>
## Canonical References

- `apps/web/src/components/layout/top-bar.tsx` (à modifier)
- `apps/web/src/components/layout/notifications-bell.tsx` (déjà implémenté — vérifier seulement)
- `apps/web/src/app/login/actions.ts` (export `logoutAction` server action)
- `apps/web/src/components/layout/mobile-menu-button.tsx` (Phase 2 — pattern client subcomponent à imiter)
- `apps/web/src/components/sessions/delete-session-button.tsx` (pattern AlertDialog Radix — confirmer destructive)
- `@radix-ui/react-dropdown-menu` (1.1.4, déjà dans deps)
- `@radix-ui/react-dialog` (1.1.4, déjà dans deps) — pour AlertDialog (utilise Dialog)
</canonical_refs>

<specifics>
## Specific Ideas

- **Nouveau composant `UserMenuButton.tsx`** (client) qui :
  ```tsx
  'use client';
  import { useState } from 'react';
  import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
  import * as Dialog from '@radix-ui/react-dialog';
  import { User as UserIcon, Settings, LogOut } from 'lucide-react';
  import { logoutAction } from '@/app/login/actions';
  import type { User } from 'lucia';

  export function UserMenuButton({ user }: { user: User }) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    return (
      <>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-3 hover:bg-muted rounded-md px-2 py-1 -mr-2 transition-colors">
              <div className="hidden sm:block text-right text-xs">
                <div className="font-medium leading-tight">{user.firstName} {user.lastName}</div>
                <div className="text-muted-foreground">{user.role}</div>
              </div>
              <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 font-semibold inline-flex items-center justify-center text-sm">
                {user.firstName.charAt(0)}{user.lastName.charAt(0)}
              </div>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-lg border border-border bg-white shadow-xl p-1 animate-in fade-in zoom-in-95">
              <div className="px-3 py-2 border-b border-border sm:hidden">
                <div className="font-medium text-sm">{user.firstName} {user.lastName}</div>
                <div className="text-xs text-muted-foreground">{user.role}</div>
              </div>
              <DropdownMenu.Item asChild>
                <Link href="/app/parametres" className="...">
                  <Settings className="h-4 w-4" /> Paramètres
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={(e) => { e.preventDefault(); setConfirmOpen(true); }}
                className="... text-red-700"
              >
                <LogOut className="h-4 w-4" /> Déconnexion
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 ..." />
            <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl ...">
              <Dialog.Title className="text-lg font-semibold">Confirmer la déconnexion</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">Tu seras redirigé(e) vers la page de connexion.</Dialog.Description>
              <form action={logoutAction} className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-md border border-input bg-white text-sm hover:bg-muted">Annuler</button>
                </Dialog.Close>
                <button type="submit" className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700">Se déconnecter</button>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </>
    );
  }
  ```

- **TopBar modification** : import `<UserMenuButton user={user} />`, supprime tout le bloc avatar + nom + form logout actuel.

- **Profil placeholder** : décidé non-implémenté ce milestone — pas d'entrée Profil dans le menu (juste Paramètres + Déconnexion). Plus simple, plus honnête.

</specifics>

<deferred>
## Deferred Ideas

- Page Profil utilisateur dédiée (édition email, mot de passe, photo) — milestone v6 si demandé
- Notifications persistées en DB + "Marquer comme lu" — milestone v6+
- Thème dark mode toggle dans le menu user — futur
- Raccourci clavier `?` pour ouvrir le menu user — futur
</deferred>

---

*Phase: 04-topbar-ux*
*Context gathered: 2026-05-13*
