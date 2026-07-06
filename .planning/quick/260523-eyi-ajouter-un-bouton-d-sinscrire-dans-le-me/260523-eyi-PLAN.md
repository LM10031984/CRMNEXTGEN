---
phase: 260523-eyi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/actions/sessions.ts
  - apps/web/src/components/sessions/participant-actions-menu.tsx
autonomous: true
requirements:
  - UNENROLL-01  # Bouton "Désinscrire" dans le menu participant fiche session
must_haves:
  truths:
    - "Un ADMIN/MANAGER voit un item 'Désinscrire' (rouge) dans le menu ··· de chaque participant sur la fiche session"
    - "Cliquer 'Désinscrire' ouvre un AlertDialog de confirmation (annulable)"
    - "Confirmer la désinscription supprime le SessionParticipant correspondant en BDD"
    - "Un AuditLog est créé avec action='sessionParticipants.delete' et entityId=participantId après suppression"
    - "Un toast de succès s'affiche et la liste des participants se rafraîchit"
    - "Un user COMMERCIAL/FORMATEUR/COMPTABLE/LECTEUR reçoit 'Accès refusé' s'il tente l'action (RBAC server-side)"
    - "Une désinscription d'un participant d'un autre tenant retourne 'Inscription introuvable' (tenant scoping)"
  artifacts:
    - path: "apps/web/src/server/actions/sessions.ts"
      provides: "Server action unenrollParticipant(participantId) avec RBAC ADMIN+MANAGER + AuditLog sessionParticipants.delete + tenant scoping"
      exports: ["unenrollParticipant"]
    - path: "apps/web/src/components/sessions/participant-actions-menu.tsx"
      provides: "DropdownMenu.Item 'Désinscrire' + AlertDialog Radix de confirmation + appel server action + toast + router.refresh"
  key_links:
    - from: "apps/web/src/components/sessions/participant-actions-menu.tsx"
      to: "unenrollParticipant"
      via: "import depuis @/server/actions/sessions, appel dans onClick de la confirmation"
      pattern: "import.*unenrollParticipant.*from.*'@/server/actions/sessions'"
    - from: "apps/web/src/server/actions/sessions.ts"
      to: "prisma.auditLog.create"
      via: "création du log après prisma.sessionParticipant.delete"
      pattern: "action:\\s*['\"]sessionParticipants\\.delete['\"]"
---

<objective>
Ajouter un bouton "Désinscrire" dans le menu d'actions participant (composant `ParticipantActionsMenu`) sur la fiche session, avec confirmation Radix AlertDialog et server action complète (RBAC ADMIN+MANAGER, tenant scoping, AuditLog `sessionParticipants.delete`, discriminated return).

Purpose: Le menu actuel n'offre que des actions de génération de documents (CONVENTION/PROGRAMME/AGEFICE). Laurent a besoin de pouvoir désinscrire un participant directement depuis la fiche session, sans passer par un éditeur séparé, avec garde-fou de confirmation et trace dans l'historique d'audit (RBAC strict ADMIN+MANAGER car action destructive).

Output: Un item rouge "Désinscrire" dans le DropdownMenu, qui ouvre un AlertDialog de confirmation, et qui — après confirmation — supprime le `SessionParticipant` côté serveur, audit-loggue l'action, affiche un toast et rafraîchit la liste.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@apps/web/src/server/actions/sessions.ts
@apps/web/src/components/sessions/participant-actions-menu.tsx
@apps/web/src/components/layout/user-menu-button.tsx
@apps/web/src/lib/rbac.ts
@apps/web/src/server/actions/update-learner-document.ts

<interfaces>
<!-- Contrats clés extraits de la codebase — utilisez-les directement, pas d'exploration. -->

From apps/web/src/lib/rbac.ts:
```typescript
export class UnauthorizedError extends Error { /* ... */ }
export class ForbiddenError extends Error { /* ... */ }
export async function requireRole(allowed: UserRole[]): Promise<LuciaUser>;
// LuciaUser fournit: id, email, role, tenantId, firstName, lastName, ...
```

From apps/web/src/server/actions/sessions.ts (existant — sera étendu/refactoré) :
```typescript
// removeParticipant EXISTE DÉJÀ (sessions.ts:115) mais :
// - RBAC actuel: ['ADMIN', 'MANAGER', 'COMMERCIAL'] → DOIT être restreint à ['ADMIN', 'MANAGER']
// - PAS d'AuditLog → DOIT être ajouté avec action='sessionParticipants.delete'
// - PAS de Zod input → DOIT être ajouté (UnenrollInputSchema)
// - Signature: (participantId: string) => Promise<{ ok: boolean; error?: string }>
//
// Décision: renommer en unenrollParticipant + garder export alias `removeParticipant`
// pour rétrocompat si d'autres consommateurs existent (grep avant suppression).
```

From packages/db/prisma/schema.prisma (SessionParticipant + AuditLog) :
```prisma
model SessionParticipant {
  id        String          @id @default(uuid())
  sessionId String
  session   TrainingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  personId  String
  person    Person          @relation(fields: [personId], references: [id])
  // ... pas de tenantId direct : scoping via session.tenantId
}

model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String
  userId    String?
  entity    String   // "SessionParticipant"
  entityId  String   // participantId
  action    String   // "sessionParticipants.delete"
  diff      Json     // { sessionId, personId, personName, sponsorOrgId, priceHT, enrollmentStatus }
  createdAt DateTime @default(now())
}
```

From apps/web/src/server/actions/update-learner-document.ts:111 (pattern AuditLog référence) :
```typescript
await prisma.auditLog.create({
  data: {
    tenantId: user.tenantId,
    userId: user.id,
    action: `learner-docs.${kind}.update`,
    entity: 'Person',
    entityId: personId,
    diff: { kind, label: KIND_LABEL[kind], objectKey: key },
  },
});
```

From apps/web/src/components/layout/user-menu-button.tsx (pattern Dialog confirmation — référence visuelle) :
```typescript
// Utilise @radix-ui/react-dialog comme AlertDialog (le projet n'a pas
// @radix-ui/react-alert-dialog installé — confirmé via grep).
// Pattern: <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
//          <Dialog.Portal><Dialog.Overlay/><Dialog.Content>
//            <Dialog.Title>...</Dialog.Title>
//            <Dialog.Description>...</Dialog.Description>
//            <Dialog.Close>Annuler</Dialog.Close>
//            <button type="submit">Confirmer (rouge)</button>
//          </Dialog.Content></Dialog.Portal></Dialog.Root>
//
// Important: dans DropdownMenu.Item onSelect → e.preventDefault() AVANT
// d'ouvrir le Dialog, sinon le dropdown se ferme et avale l'event.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Server action unenrollParticipant (RBAC ADMIN+MANAGER + AuditLog + Zod)</name>
  <files>apps/web/src/server/actions/sessions.ts</files>
  <behavior>
    - Test 1: Appel sans session valide → `{ ok: false, error: 'Non authentifié' }` (UnauthorizedError)
    - Test 2: Appel COMMERCIAL → `{ ok: false, error: 'Rôle COMMERCIAL non autorisé' }` (ForbiddenError, durci vs avant)
    - Test 3: Appel ADMIN sur participantId d'un autre tenant → `{ ok: false, error: 'Inscription introuvable.' }`
    - Test 4: Appel MANAGER sur participantId valide → `{ ok: true }`, `prisma.sessionParticipant.delete` appelé, `prisma.auditLog.create` appelé avec `action='sessionParticipants.delete'`, `entity='SessionParticipant'`, `entityId=participantId`, `diff` contient sessionId/personId/sponsorOrgId/priceHT
    - Test 5: Input invalide (string non-UUID) → `{ ok: false, error: <message Zod> }`
    - Test 6: `revalidatePath` appelé sur `/app/sessions/{sessionId}` après succès
  </behavior>
  <action>
    Refactor `removeParticipant` en `unenrollParticipant` dans `apps/web/src/server/actions/sessions.ts` :

    1. **Vérifier consommateurs existants** : `grep -rn "removeParticipant" apps/web/src` pour identifier qui l'appelle actuellement (probablement aucun composant ou un legacy). Si aucun consommateur autre que tests → renommer purement. Sinon garder `removeParticipant` comme alias `export const removeParticipant = unenrollParticipant;`.

    2. **Ajouter le Zod schema** en tête de fichier (ou juste avant la fonction) :
       ```typescript
       import { z } from 'zod';
       const UnenrollInputSchema = z.object({
         participantId: z.string().uuid('participantId doit être un UUID valide'),
       });
       ```

    3. **Réécrire la fonction** avec :
       - Signature : `export async function unenrollParticipant(participantId: string): Promise<{ ok: true } | { ok: false; error: string }>`
       - Validation Zod en premier (avant tout I/O)
       - `requireRole(['ADMIN', 'MANAGER'])` (DURCI vs ancien `['ADMIN', 'MANAGER', 'COMMERCIAL']` — spec utilisateur). Capture UnauthorizedError/ForbiddenError → return `{ ok: false, error: e.message }`
       - `prisma.sessionParticipant.findUnique` avec `include: { session: { select: { tenantId: true, id: true } }, person: { select: { firstName: true, lastName: true } } }`
       - Si non trouvé OU `part.session.tenantId !== user.tenantId` → `{ ok: false, error: 'Inscription introuvable.' }`
       - **Transaction Prisma** pour atomicité delete + auditLog :
         ```typescript
         await prisma.$transaction([
           prisma.sessionParticipant.delete({ where: { id: validated.participantId } }),
           prisma.auditLog.create({
             data: {
               tenantId: user.tenantId,
               userId: user.id,
               entity: 'SessionParticipant',
               entityId: validated.participantId,
               action: 'sessionParticipants.delete',
               diff: {
                 sessionId: part.session.id,
                 personId: part.personId,
                 personName: `${part.person.firstName} ${part.person.lastName}`,
                 sponsorOrgId: part.sponsorOrgId,
                 priceHT: Number(part.priceHT),
                 enrollmentStatus: part.enrollmentStatus,
               },
             },
           }),
         ]);
         ```
       - `revalidatePath(\`/app/sessions/\${part.session.id}\`)` puis `return { ok: true }`

    4. **Convention AuditLog** : `sessionParticipants.delete` suit strictement `[entity].[verb]` (pluriel pour cohérence avec `parameters.update`, `documents.*`, `invoices.*` déjà posés cf. CLAUDE.md / MEMORY).

    5. **Garder l'alias** si nécessaire :
       ```typescript
       /** @deprecated utiliser unenrollParticipant */
       export const removeParticipant = unenrollParticipant;
       ```
       (à supprimer après nettoyage des appelants)
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web typecheck && pnpm --filter @qualiof/web test -- sessions 2>/dev/null; pnpm --filter @qualiof/web test --run apps/web/src/server/actions/__tests__/sessions.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>
    - `unenrollParticipant` exporté depuis `apps/web/src/server/actions/sessions.ts`
    - RBAC strict ADMIN+MANAGER (COMMERCIAL retiré)
    - Zod validation participantId UUID
    - Tenant scoping via `part.session.tenantId === user.tenantId`
    - Transaction Prisma delete + auditLog atomique
    - AuditLog action = `'sessionParticipants.delete'`, entity = `'SessionParticipant'`, diff contient sessionId/personId/sponsorOrgId/priceHT
    - `revalidatePath` appelé sur la fiche session
    - Tests existants `sessions.test.ts` (s'il y en a) passent toujours ; sinon `pnpm --filter @qualiof/web typecheck` vert
    - Aucun consommateur cassé (grep `removeParticipant` propre OU alias gardé)
  </done>
</task>

<task type="auto">
  <name>Task 2: UI — item "Désinscrire" + AlertDialog confirmation dans ParticipantActionsMenu</name>
  <files>apps/web/src/components/sessions/participant-actions-menu.tsx</files>
  <action>
    Étendre `apps/web/src/components/sessions/participant-actions-menu.tsx` pour ajouter un item destructif "Désinscrire" dans le DropdownMenu, protégé par une confirmation Radix Dialog (le projet utilise `@radix-ui/react-dialog`, pas `react-alert-dialog` — confirmé via grep).

    1. **Imports à ajouter** :
       ```typescript
       import * as Dialog from '@radix-ui/react-dialog';
       import { UserMinus } from 'lucide-react';
       import { unenrollParticipant } from '@/server/actions/sessions';
       ```

    2. **State local** : `const [confirmOpen, setConfirmOpen] = useState(false);` à côté des autres useState.

    3. **Séparateur + Item destructif** dans `<DropdownMenu.Content>`, APRÈS le bloc AGEFICE (lignes 152-164), AVANT le `</DropdownMenu.Content>` :
       ```tsx
       <DropdownMenu.Separator className="my-1 h-px bg-border" />
       <DropdownMenu.Item
         disabled={pending}
         onSelect={(e) => {
           e.preventDefault(); // garder le menu ouvert le temps que le Dialog s'ouvre
           setConfirmOpen(true);
         }}
         className="flex items-center gap-2 px-2.5 py-1.5 rounded text-sm cursor-pointer outline-none text-red-700 data-[highlighted]:bg-red-50"
       >
         <UserMinus className="h-3.5 w-3.5" />
         Désinscrire
       </DropdownMenu.Item>
       ```

    4. **Handler de désinscription** :
       ```typescript
       function handleUnenroll() {
         startTransition(async () => {
           try {
             const r = await unenrollParticipant(participantId);
             if (r.ok) {
               toast.success(`${participantName} désinscrit(e) de la session`);
               setConfirmOpen(false);
               router.refresh();
             } else {
               toast.error(r.error ?? 'Erreur lors de la désinscription');
             }
           } catch (e: any) {
             toast.error(`Erreur : ${e?.message ?? String(e)}`);
           }
         });
       }
       ```

    5. **Dialog de confirmation** ajouté en sortie du composant (après `</DropdownMenu.Root>`, dans le `<div>` racine — ou wrap le tout dans un Fragment `<>...</>` comme UserMenuButton) :
       ```tsx
       <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
         <Dialog.Portal>
           <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
           <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[440px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
             <Dialog.Title className="text-lg font-semibold">
               Désinscrire {participantName} ?
             </Dialog.Title>
             <Dialog.Description className="mt-2 text-sm text-muted-foreground">
               Cette action est définitive. L'inscription sera supprimée de la session.
               Les documents déjà générés (convention, programme, AGEFICE) restent
               disponibles dans la fiche apprenant.
             </Dialog.Description>
             <div className="mt-5 flex justify-end gap-2">
               <Dialog.Close asChild>
                 <button
                   type="button"
                   disabled={pending}
                   className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
                 >
                   Annuler
                 </button>
               </Dialog.Close>
               <button
                 type="button"
                 disabled={pending}
                 onClick={handleUnenroll}
                 className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
               >
                 {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                 Désinscrire
               </button>
             </div>
           </Dialog.Content>
         </Dialog.Portal>
       </Dialog.Root>
       ```

    6. **Structure JSX** : wrap le return courant dans `<>...</>` (Fragment) et placer le `<Dialog.Root>` en dehors du `<div className="flex items-center gap-1 shrink-0">` pour éviter que le Portal hérite des contraintes flex (cf. pattern UserMenuButton qui utilise `<>...</>` pour la même raison).

    7. **Pas de breaking change** sur la signature du composant — `participantId`, `participantName`, `showAgefice`, `initialDocs` restent identiques. Les 2 call sites (`/app/sessions/[id]/page.tsx:713` et `/app/apprenants/[id]/page.tsx:750`) n'ont rien à changer.

    Note RBAC client : le composant n'a pas connaissance du rôle du user. C'est intentionnel — le bouton apparaît toujours, mais le server action rejette si rôle insuffisant et affiche le toast d'erreur. Si Laurent veut masquer le bouton selon le rôle dans une itération future, il faudra passer `userRole` en prop (hors scope ici).
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web typecheck && pnpm --filter @qualiof/web build 2>&1 | tail -15</automated>
  </verify>
  <done>
    - Item "Désinscrire" (rouge, icône UserMinus) visible dans le DropdownMenu de chaque participant sur la fiche session
    - Cliquer l'item ouvre un AlertDialog Radix de confirmation (Annuler / Désinscrire rouge)
    - Confirmer appelle `unenrollParticipant(participantId)` ; toast succès + `router.refresh()` ; toast erreur en cas d'échec (ex: rôle non autorisé)
    - Annuler ferme le Dialog sans action serveur
    - Pendant la transition : bouton "Désinscrire" du Dialog affiche un spinner, Annuler et Désinscrire désactivés
    - Le composant compile (`pnpm --filter @qualiof/web typecheck` vert)
    - Le build Next produit (`pnpm --filter @qualiof/web build`) — pas de régression dans `/app/sessions/[id]` ni `/app/apprenants/[id]`
    - Aucune modif requise dans les 2 call sites du composant
  </done>
</task>

</tasks>

<verification>
**Manual smoke test (1 min)** — à exécuter par Laurent après merge :
1. `pnpm dev:full` puis ouvrir une fiche session avec ≥1 participant
2. Cliquer `···` sur un participant → vérifier item rouge "Désinscrire" présent
3. Cliquer "Désinscrire" → vérifier modale "Désinscrire {Prénom Nom} ?"
4. Cliquer "Annuler" → modale se ferme, rien n'a changé
5. Re-cliquer "Désinscrire" puis confirmer → toast vert "{Nom} désinscrit(e) de la session", liste rafraîchie sans le participant
6. Vérifier dans `/app/historique` (page AuditLog) qu'une entrée `sessionParticipants.delete` est présente

**Tenant scoping check** : impossible à tester sans un 2e tenant en local — couverture par la review de code (la condition `part.session.tenantId !== user.tenantId` est explicite).

**RBAC check** : se connecter en COMMERCIAL/FORMATEUR (si seed disponible) → cliquer Désinscrire + confirmer → vérifier toast d'erreur "Rôle COMMERCIAL non autorisé".
</verification>

<success_criteria>
- [ ] `unenrollParticipant` exportée depuis `apps/web/src/server/actions/sessions.ts` avec RBAC ADMIN+MANAGER + AuditLog + Zod + tenant scoping
- [ ] AuditLog créé avec `action='sessionParticipants.delete'` conforme à la convention `[entity].[verb]`
- [ ] Item "Désinscrire" + AlertDialog Radix opérationnels dans `participant-actions-menu.tsx`
- [ ] `pnpm --filter @qualiof/web typecheck` vert
- [ ] `pnpm --filter @qualiof/web build` réussit
- [ ] Tests existants (si `sessions.test.ts` présent) passent ; sinon pas de régression sur les tests existants du dossier
- [ ] Aucun consommateur de `removeParticipant` cassé (soit renommé partout, soit alias deprecated en place)
- [ ] Smoke test manuel Laurent OK (toast + audit log + refresh)
</success_criteria>

<output>
After completion, create `.planning/quick/260523-eyi-ajouter-un-bouton-d-sinscrire-dans-le-me/260523-eyi-01-SUMMARY.md` summarizing :
- Décision finale sur `removeParticipant` (renommé pur ou alias deprecated)
- Liste exacte des consommateurs touchés (grep result)
- Snippet de l'AuditLog créé (shape du `diff`)
- Confirmation que les 2 pages call sites compilent sans modif
</output>
