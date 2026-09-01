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
| Béatrice L. (`f***@start-academy.fr`) | ADMIN | 2026-08-04T13:31:39Z, **renvoyée 2026-08-12** (voir § Renvoi) | `<0730b14e-c415-2475-40c5-be8bf0484ecb@start-academy.fr>` | _(en attente — lien frais valable jusqu'au 19/08)_ |
| Jean-Guy O. (`j***@start-academy.fr`) | ADMIN | 2026-08-04T13:31:42Z (expirée 11/08, non utilisée) | `<f186efca-f8b9-04ae-85b2-3c232414acbc@start-academy.fr>` | _(en attente — renvoi à la demande)_ |
| Laurent M. (`l***@start-academy.fr`) | ADMIN | 2026-08-04T13:31:44Z | `<6698738c-bf75-153e-3bfa-982a76cc0db1@start-academy.fr>` | **2026-08-04T13:33:35Z** (invitation acceptée, 1 AuthSession — non « tierce » au sens du critère) |

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

## Renvoi du 2026-08-12 (liens du 04/08 expirés le 11/08)

Demande Laurent (12/08) : renvoi à **Béatrice uniquement**. Flux `resendInvitation`
répliqué à l'identique (`_resend-invitation.ts` — nouvelle `UserInvitation` à token
frais sur le User EXISTANT, aucun nouveau compte, AuditLog `users.invitation.resend`).
Garde 22-11 re-vérifié OUVERT en base avant envoi (`emailsEnabled=true` +
`userInvitationsEnabled=true`, inchangés depuis le 04/08 13:09Z).

| Preuve | Valeur |
| --- | --- |
| Renvoi parti réellement | `dryRun=false`, `suppressed=false` |
| messageId SMTP | `<b6b12660-74bb-1d23-1967-7bd1a7893d4a@start-academy.fr>` |
| Nouvelle invitation | `f0fdf760-0620-45c2-be62-07f70026ed2a`, expire **2026-08-19T10:24:36Z** (J+7) |
| Ancienne invitation | `0e95a271…` expirée 2026-08-11, `usedAt=null` (jamais cliquée) |

Relevé de connexions au 12/08 (DRY, avant renvoi) :

```
f***@start-academy.fr role=ADMIN lastLogin=jamais authSessions=0
j***@start-academy.fr role=ADMIN lastLogin=jamais authSessions=0
l***@start-academy.fr role=ADMIN lastLogin=2026-08-04T13:33:35.417Z authSessions=1
```

→ **Laurent a accepté son invitation et s'est connecté le 04/08 à 13:33Z** (compte créé
par l'invitation, AuthSession en base) — le flux invitation→connexion est prouvé de bout
en bout, mais ce n'est pas la connexion « tierce » attendue (Béatrice ou Jean-Guy).

## Preuve de première connexion tierce (critère CUT-01 / objectif v6)

_(à remplir à la clôture du plan : `User.lastLoginAt` daté + `AuthSession` en base pour
Béatrice ou Jean-Guy — requête Prisma collée ici)_

Aucun token ni mot de passe dans ce document.
