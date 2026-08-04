# 22-TEAM-INVITES — Invitations équipe de départ (D-09, dernier critère CUT-01)

> Plan 22-09 — exécuté le 2026-08-04. Liste fournie et validée par Laurent
> (checkpoint Task 1). Envoi via le flux Phase 8 existant (`inviteUser`,
> `tenant-users.ts`) répliqué à l'identique par le script one-shot
> `apps/web/scripts/_invite-team.ts` (DRY→WRITE, garde-fous fail-loud) —
> 0 code nouveau dans `apps/web/src`.
> **Pas de PII superflue** : membres identifiés par prénom + initiale, emails masqués.

## Séquence garde-fou (22-11) respectée avant tout envoi

| Heure (UTC, 2026-08-04) | Événement (preuve en base) |
| --- | --- |
| 11:43:32 | Création `TenantEmailSettings` par Laurent (tout OFF sauf notifs internes, 1 session test) |
| 12:08:53 | Coche « invitations utilisateur » (`userInvitationsEnabled` false→true) — interrupteur général encore OFF |
| 12:10 → 12:20 | 4 relevés Claude : garde fermé (`emailsEnabled=false`) → **0 envoi**, checkpoint retourné |
| 13:09:10 | Laurent enregistre l'interrupteur général ON (`emailsEnabled=true`) — « relances factures » reste décochée (décision 22-07, Railway Hobby) |
| 13:31 | Re-vérification Claude PUIS envoi WRITE=1 |

## Invitations envoyées (WRITE=1, 2026-08-04T13:31Z)

Rôle RBAC : **ADMIN** pour les 3 (décision Laurent). Liens d'invitation vers
`https://qualiof.vercel.app/invitation/<token>` (token 32 hex, expiration J+7 = 2026-08-11).
Expéditeur : `QualiOF <formation@start-academy.fr>` (SMTP Google Workspace, catégorie
`user_invitation` — garde 22-11 passée, `suppressed=false`).

| Membre | Rôle | Invitation envoyée le | messageId SMTP (preuve envoi réel) | Première connexion le |
| --- | --- | --- | --- | --- |
| Béatrice L. (`f***@start-academy.fr`) | ADMIN | 2026-08-04T13:31:39Z | `<0730b14e-c415-2475-40c5-be8bf0484ecb@start-academy.fr>` | _(en attente — voir checkpoint)_ |
| Jean-Guy O. (`j***@start-academy.fr`) | ADMIN | 2026-08-04T13:31:42Z | `<f186efca-f8b9-04ae-85b2-3c232414acbc@start-academy.fr>` | _(en attente)_ |
| Laurent M. (`l***@start-academy.fr`) | ADMIN | 2026-08-04T13:31:44Z | `<6698738c-bf75-153e-3bfa-982a76cc0db1@start-academy.fr>` | _(en attente)_ |

Note : Béatrice = boîte expéditrice `formation@` — elle reçoit un email « de sa propre
adresse », c'est attendu.

## Contrôle Prisma post-envoi (sortie script, emails masqués)

```
Contrôle Users en base:
  f***@start-academy.fr role=ADMIN tenant=OK invitedAt=2026-08-04T13:31:39.361Z lastLogin=jamais
  j***@start-academy.fr role=ADMIN tenant=OK invitedAt=2026-08-04T13:31:42.225Z lastLogin=jamais
  l***@start-academy.fr role=ADMIN tenant=OK invitedAt=2026-08-04T13:31:44.723Z lastLogin=jamais
```

- 3 `User` créés (`hashedPwd=''` placeholder — connexion impossible avant acceptation
  de l'invitation), 3 `UserInvitation` liées, 3 AuditLog `users.invite`
  (`diff.via: 'script-22-09'`), acteur `invitedBy` = admin e2e (seul ADMIN actif
  sur email officiel).
- **Cas Laurent (consigné, demandé au checkpoint)** : AUCUN compte `User` n'existait
  sous son email officiel `l***@start-academy.fr` → invité normalement, pas de doublon.
  Observation : 2 comptes legacy du seed sous le domaine **sans tiret** `@startacademy.fr`
  (1 ADMIN, dernier login 2026-07-13 ; 1 LECTEUR jamais connecté) — emails distincts,
  hors périmètre ; candidats à désactivation post-onboarding (décision Laurent à venir).

## Preuve de première connexion tierce (critère CUT-01 / objectif v6)

_(à remplir à la clôture du plan : `User.lastLoginAt` daté + `AuthSession` en base pour
le membre connecté — requête Prisma collée ici)_

Aucun token ni mot de passe dans ce document.
