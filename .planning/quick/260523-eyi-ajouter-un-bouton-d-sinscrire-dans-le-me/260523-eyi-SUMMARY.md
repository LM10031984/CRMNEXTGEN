---
phase: 260523-eyi
plan: 01
subsystem: sessions
tags: [sessions, rbac, audit-log, ui, radix-dialog, server-action]
type: summary
requires:
  - "@/lib/rbac requireRole"
  - "@/lib/auth validateRequest"
  - "@qualiof/db prisma.sessionParticipant + prisma.auditLog"
  - "@radix-ui/react-dropdown-menu"
  - "@radix-ui/react-dialog"
  - "sonner (toast)"
provides:
  - "unenrollParticipant(participantId): { ok: true } | { ok: false; error }"
  - "AuditLog convention 'sessionParticipants.delete'"
  - "UI item 'Désinscrire' + AlertDialog dans ParticipantActionsMenu"
affects:
  - "apps/web/src/app/app/sessions/[id]/page.tsx (call site, inchangé)"
  - "apps/web/src/app/app/apprenants/[id]/page.tsx (call site, inchangé)"
tech-stack:
  added:
    - "zod (déjà présent dans le projet, ajouté à l'import du fichier)"
  patterns:
    - "Transaction Prisma atomique delete + auditLog"
    - "Discriminated union return { ok: true } | { ok: false; error }"
    - "RBAC durci action destructive : ADMIN+MANAGER only"
    - "Fragment wrap pour faire sortir Dialog.Portal du flex shrink-0"
key-files:
  created:
    - "apps/web/src/server/actions/__tests__/sessions-unenroll.test.ts"
  modified:
    - "apps/web/src/server/actions/sessions.ts"
    - "apps/web/src/components/sessions/participant-actions-menu.tsx"
decisions:
  - id: D-01
    summary: "removeParticipant renommé en unenrollParticipant (pas d'alias deprecated — aucun consommateur externe)"
  - id: D-02
    summary: "RBAC durci ADMIN+MANAGER (COMMERCIAL retiré — action destructive)"
  - id: D-03
    summary: "AuditLog convention sessionParticipants.delete (pluriel, cohérence parameters.update / invoices.* / documents.*)"
  - id: D-04
    summary: "@radix-ui/react-dialog utilisé comme AlertDialog (le projet n'a pas react-alert-dialog installé)"
  - id: D-05
    summary: "Bouton Désinscrire visible pour tous les rôles côté UI — le RBAC server-side fait le filtre (toast d'erreur si rôle insuffisant). Itération future possible pour masquer côté UI."
metrics:
  duration: "~30 min"
  tasks: 2
  files-modified: 2
  files-created: 1
  tests-added: 7
  completed: "2026-05-23"
requirements:
  - UNENROLL-01
---

# Quick Task 260523-eyi : Bouton Désinscrire fiche session — Summary

**One-liner :** Server action `unenrollParticipant` (RBAC ADMIN+MANAGER + AuditLog atomique + Zod) + item rouge "Désinscrire" avec AlertDialog Radix de confirmation dans `ParticipantActionsMenu`.

## Tasks Completed

| # | Name                                                          | Type   | Commit    | Files                                                                                  |
| - | ------------------------------------------------------------- | ------ | --------- | -------------------------------------------------------------------------------------- |
| 1 | Server action `unenrollParticipant` (TDD : RED + GREEN)       | auto/tdd | 557d6f2 (RED) + 6c2387f (GREEN) | `apps/web/src/server/actions/sessions.ts` + `__tests__/sessions-unenroll.test.ts` |
| 2 | UI item "Désinscrire" + AlertDialog dans ParticipantActionsMenu | auto   | 666a949   | `apps/web/src/components/sessions/participant-actions-menu.tsx`                       |

## What Was Built

### 1. Server action `unenrollParticipant`

- **Localisation :** `apps/web/src/server/actions/sessions.ts:120`
- **Signature :** `(participantId: string) => Promise<{ ok: true } | { ok: false; error: string }>`
- **Pipeline :**
  1. Zod `UnenrollInputSchema` (UUID strict)
  2. `requireRole(['ADMIN', 'MANAGER'])` — COMMERCIAL retiré (durcissement spec)
  3. `prisma.sessionParticipant.findUnique` + tenant scoping via `part.session.tenantId === user.tenantId`
  4. **Transaction atomique** : `prisma.$transaction([delete, auditLog.create])`
  5. `revalidatePath('/app/sessions/{sessionId}')` + `return { ok: true }`

**Shape AuditLog créé** (`action='sessionParticipants.delete'`, `entity='SessionParticipant'`, `entityId=participantId`) :

```jsonc
{
  "tenantId": "<user.tenantId>",
  "userId": "<user.id>",
  "entity": "SessionParticipant",
  "entityId": "<participantId>",
  "action": "sessionParticipants.delete",
  "diff": {
    "sessionId": "<part.session.id>",
    "personId": "<part.personId>",
    "personName": "Prénom Nom",
    "sponsorOrgId": "<part.sponsorOrgId>",
    "priceHT": 1500,
    "enrollmentStatus": "CONFIRMED"
  }
}
```

### 2. UI — `ParticipantActionsMenu`

- **DropdownMenu.Item rouge "Désinscrire"** ajouté après séparateur, icône `UserMinus`
- `onSelect={(e) => { e.preventDefault(); setConfirmOpen(true); }}` — empêche la fermeture du dropdown d'avaler l'ouverture du Dialog
- **AlertDialog Radix** (`@radix-ui/react-dialog`) avec :
  - Titre : `Désinscrire {participantName} ?`
  - Description : action définitive, mention que les docs déjà générés restent dans la fiche apprenant
  - Bouton "Annuler" (`Dialog.Close`) + bouton rouge "Désinscrire" avec spinner durant `pending`
- Handler `handleUnenroll()` : appel server action → toast vert/rouge + `router.refresh()` + ferme dialog si succès
- **Wrap dans Fragment `<>...</>`** : nécessaire pour que `Dialog.Portal` sorte du conteneur `div.flex.shrink-0` (cf. pattern `UserMenuButton`)

## Decisions Made

### D-01 — `removeParticipant` renommé pur, pas d'alias

**Grep result :**

```text
apps/web/src/server/actions/sessions.ts:115:export async function removeParticipant(...)
apps/web/src/components/wizards/session-wizard.tsx:211: const removeParticipant = (personId: string) => { ... }  // ← FONCTION LOCALE HOMONYME (pas un import)
apps/web/src/components/wizards/session-wizard.tsx:534: onClick={() => removeParticipant(p.personId)}  // ← appel local
```

`session-wizard.tsx` n'importe **pas** `removeParticipant` depuis `@/server/actions/sessions` (vérifié `grep "from.*sessions'"` → 0 résultat sur ce nom). C'est une fonction client-side homonyme dans le wizard qui gère un tableau local de pré-participants avant création.

**Décision :** renommage pur en `unenrollParticipant`, aucun alias deprecated nécessaire. Code propre dès le commit GREEN.

### D-02 — RBAC durci

L'ancien `removeParticipant` acceptait `['ADMIN', 'MANAGER', 'COMMERCIAL']`. Le plan demande explicitement la restriction à `['ADMIN', 'MANAGER']` (action destructive). Justifié : un commercial qui désinscrit "par erreur" perd la traçabilité d'inscription (même si l'AuditLog la conserve). Réservé à l'encadrement.

### D-03 — Convention AuditLog

`action='sessionParticipants.delete'` suit strictement `[entity].[verb]` (pluriel pour cohérence avec `parameters.update`, `documents.*`, `invoices.*` déjà posés dans le projet).

### D-04 — Radix Dialog (pas AlertDialog)

Le projet n'a **pas** `@radix-ui/react-alert-dialog` installé. `@radix-ui/react-dialog` (déjà utilisé dans `UserMenuButton`) fait parfaitement l'affaire pour une confirmation. Pas d'ajout de dépendance.

### D-05 — Visibilité du bouton

Le composant n'a pas connaissance du rôle du user (intentionnel). Le bouton apparaît pour tout le monde, mais le server action rejette si rôle insuffisant et affiche le toast d'erreur. Si Laurent veut masquer côté UI dans une itération future, il faudra passer `userRole` en prop (hors scope ici).

## Verification

### Automated

- `pnpm vitest run src/server/actions/__tests__/sessions-unenroll.test.ts` → **7/7 verts**
  - Test 1 : auth gate `UnauthorizedError` → `{ ok:false, error:'Non authentifié' }`
  - Test 2 : COMMERCIAL → `ForbiddenError` + check que requireRole appelé avec `['ADMIN','MANAGER']` (sans COMMERCIAL)
  - Test 3 : participant d'un autre tenant → `'Inscription introuvable.'`
  - Test 4 : MANAGER OK → delete + auditLog avec diff complet vérifié (sessionId, personId, personName, sponsorOrgId, priceHT=1500, enrollmentStatus)
  - Test 5 : input non-UUID → message Zod
  - Test 6 : `revalidatePath('/app/sessions/{sessionId}')` appelé
  - Test 7 : participant inexistant → `'Inscription introuvable.'`
- `npx tsc --noEmit` (apps/web) → **0 erreur** (les 2 call sites `sessions/[id]/page.tsx` et `apprenants/[id]/page.tsx` compilent sans modification)

### Manual smoke test (à exécuter par Laurent après merge)

1. `pnpm dev:full` puis ouvrir une fiche session avec ≥1 participant
2. Cliquer `···` sur un participant → vérifier item rouge "Désinscrire" présent
3. Cliquer "Désinscrire" → vérifier modale "Désinscrire {Prénom Nom} ?"
4. Cliquer "Annuler" → modale se ferme, rien n'a changé
5. Re-cliquer "Désinscrire" puis confirmer → toast vert "{Nom} désinscrit(e) de la session", liste rafraîchie sans le participant
6. Vérifier dans `/app/historique` (page AuditLog) qu'une entrée `sessionParticipants.delete` est présente

## Deviations from Plan

**Aucune** — le plan a été exécuté tel qu'écrit. Détails mineurs d'implémentation :

- Pas d'alias `removeParticipant` (D-01 : aucun consommateur externe, le `session-wizard.tsx` a une fonction locale homonyme indépendante)
- Mock de test étendu avec `LegalForm` (et tous les modèles `prisma.*` touchés transitivement par l'import de `sessions.ts`) pour éviter l'erreur `No "LegalForm" export is defined` venant de `@qualiof/shared/constants/legal-form.ts` chargé via `@qualiof/db`. Hors-scope du plan mais bloquait l'exécution des tests → réglé en élargissant le mock du fichier de test.

## Self-Check: PASSED

- [x] `apps/web/src/server/actions/sessions.ts` modifié (vérifié via grep `unenrollParticipant`)
- [x] `apps/web/src/components/sessions/participant-actions-menu.tsx` modifié (vérifié via grep `unenrollParticipant` + `Désinscrire`)
- [x] `apps/web/src/server/actions/__tests__/sessions-unenroll.test.ts` créé (7 tests, all green)
- [x] Commits trouvés : `557d6f2` (RED), `6c2387f` (GREEN Task 1), `666a949` (Task 2)
- [x] `pnpm vitest run src/server/actions/__tests__/sessions-unenroll.test.ts` → 7/7 verts
- [x] `npx tsc --noEmit` → 0 erreur
- [x] Aucun consommateur `removeParticipant` externe cassé (grep propre)

## Known Stubs

Aucun — toute la chaîne est branchée :

- Server action → BDD réelle via Prisma
- AuditLog créé via la même transaction
- UI → server action → toast + refresh

## Files Touched

```text
apps/web/src/server/actions/sessions.ts                                +134 -8
apps/web/src/components/sessions/participant-actions-menu.tsx          +73  -1
apps/web/src/server/actions/__tests__/sessions-unenroll.test.ts        +266  (new)
.planning/quick/260523-eyi-.../260523-eyi-SUMMARY.md                   (this file, new)
```

## Next Steps Suggestion

- (out of scope) Si Laurent veut masquer le bouton côté UI pour les rôles non ADMIN/MANAGER, passer `userRole` en prop à `ParticipantActionsMenu` depuis les 2 call sites (page sessions + page apprenants).
- (out of scope) Le test pré-existant `src/lib/__tests__/product-stats.test.ts` Test 5 échoue (`caCumule expected 28500, got 0`) — déjà tracé dans MEMORY comme "tests product-stats à fixer". Hors scope de cette tâche.
