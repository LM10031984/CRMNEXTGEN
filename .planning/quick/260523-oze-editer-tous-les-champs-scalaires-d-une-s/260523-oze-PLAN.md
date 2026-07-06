---
phase: quick/260523-oze
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/schemas/session.ts
  - packages/shared/src/schemas/index.ts
  - apps/web/src/server/actions/sessions.ts
  - apps/web/src/components/sessions/edit-session-details-dialog.tsx
  - apps/web/src/app/app/sessions/[id]/page.tsx
autonomous: true
requirements:
  - OZE-01  # Server action updateSessionDetails + Zod schema partagé
  - OZE-02  # Dialog Radix "Modifier la session" + RHF + intégration fiche session
must_haves:
  truths:
    - "ADMIN/MANAGER voit un bouton 'Modifier' (icône Pencil) près du header sur la fiche session"
    - "Le clic ouvre une modale avec 9 champs pré-remplis : nom, date début, date fin, capacité min, capacité max, modalité, prix HT/apprenant, langue, notes internes"
    - "Le submit met à jour TrainingSession en BDD et ferme la modale"
    - "Un toast vert confirme 'Session mise à jour' et la fiche se rafraîchit (les nouvelles valeurs apparaissent dans le PageHeader et le résumé)"
    - "Une validation côté serveur refuse endDate < startDate, capacityMax < capacityMin, pricePerLearner < 0 (affiche un toast rouge avec le message)"
    - "Modifier la date sans toucher l'heure préserve les horaires d'origine (pattern datetime classique : on change le jour, on garde l'heure stockée en BDD)"
    - "Un AuditLog avec action='sessions.update' est créé contenant le diff (avant/après) des champs effectivement modifiés"
    - "Un COMMERCIAL n'a PAS le bouton 'Modifier' (rendu conditionnel) et la server action refuse l'appel avec un toast 'Rôle COMMERCIAL non autorisé'"
  artifacts:
    - path: "packages/shared/src/schemas/session.ts"
      provides: "UpdateSessionDetailsInputSchema (Zod) + UpdateSessionDetailsInput type"
      exports: ["UpdateSessionDetailsInputSchema", "UpdateSessionDetailsInput"]
    - path: "apps/web/src/server/actions/sessions.ts"
      provides: "Server action updateSessionDetails (ajoutée au fichier existant)"
      contains: "export async function updateSessionDetails"
    - path: "apps/web/src/components/sessions/edit-session-details-dialog.tsx"
      provides: "Composant client : bouton Pencil + Dialog Radix + form RHF"
      exports: ["EditSessionDetailsDialog"]
  key_links:
    - from: "apps/web/src/components/sessions/edit-session-details-dialog.tsx"
      to: "apps/web/src/server/actions/sessions.ts::updateSessionDetails"
      via: "import + appel dans onSubmit"
      pattern: "updateSessionDetails\\("
    - from: "apps/web/src/components/sessions/edit-session-details-dialog.tsx"
      to: "@qualiof/shared::UpdateSessionDetailsInputSchema"
      via: "zodResolver"
      pattern: "zodResolver\\(UpdateSessionDetailsInputSchema\\)"
    - from: "apps/web/src/app/app/sessions/[id]/page.tsx"
      to: "EditSessionDetailsDialog"
      via: "rendu conditionnel ['ADMIN','MANAGER'].includes(user.role) près du header"
      pattern: "<EditSessionDetailsDialog"
---

<objective>
Permettre à un ADMIN/MANAGER d'éditer en une seule modale tous les champs scalaires d'une session (name, startDate, endDate, capacityMin, capacityMax, modality, pricePerLearner, language, internalNotes) depuis la fiche session, sans avoir à recréer la session ni passer par 9 micro-éditeurs inline distincts.

Purpose : aujourd'hui status / location / trainers / logistique formateur sont éditables inline, mais TOUS les autres champs scalaires sont figés à la création. Pour corriger une coquille dans le nom, élargir la capacité, baisser le prix HT, décaler une date, l'utilisateur doit aujourd'hui soit demander un SQL, soit dupliquer + recréer. Cette quick task ferme ce trou avec une UX standard "modale Modifier" en suivant strictement les patterns déjà posés (CreateCreditNoteDialog, unenrollParticipant pattern AuditLog/RBAC).

Output :
- 1 schéma Zod partagé `UpdateSessionDetailsInputSchema`
- 1 server action `updateSessionDetails` (ADMIN+MANAGER, tenant-scopé, AuditLog `sessions.update`)
- 1 composant React `EditSessionDetailsDialog` (Radix Dialog + RHF)
- Intégration dans la fiche session avec rendu conditionnel par rôle
</objective>

<context>
@.planning/STATE.md
@apps/web/src/server/actions/sessions.ts
@apps/web/src/app/app/sessions/[id]/page.tsx
@apps/web/src/components/sessions/session-logistics-editor.tsx
@apps/web/src/components/invoices/create-credit-note-dialog.tsx
@apps/web/src/lib/rbac.ts
@packages/db/prisma/schema.prisma
@packages/shared/src/schemas/invoice.ts
@packages/shared/src/schemas/index.ts

<interfaces>
<!-- Contrats extraits du codebase — l'exécuteur n'a pas à chercher. -->

Modèle Prisma cible (extrait `packages/db/prisma/schema.prisma`) :
```
model TrainingSession {
  id              String        @id
  tenantId        String
  name            String?
  startDate       DateTime
  endDate         DateTime
  modality        Modality      // PRESENTIEL | DISTANCIEL | MIXTE | ELEARNING
  capacityMin     Int           @default(1)
  capacityMax     Int           @default(12)
  language        String        @default("fr")
  internalNotes   String?
  pricePerLearner Decimal?      @db.Decimal(10, 2)
  // ...autres champs non concernés
}
enum Modality { PRESENTIEL DISTANCIEL MIXTE ELEARNING }
```

Pattern RBAC + AuditLog (cloné de `unenrollParticipant` dans sessions.ts ligne 134-191) :
```typescript
// 1) Zod validation
const parsed = UpdateSessionDetailsInputSchema.safeParse(input);
if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' };

// 2) RBAC ADMIN+MANAGER
let user;
try { user = await requireRole(['ADMIN', 'MANAGER']); }
catch (e) {
  if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
  throw e;
}

// 3) Récupération + tenant scoping
const session = await prisma.trainingSession.findFirst({
  where: { id: parsed.data.sessionId, tenantId: user.tenantId },
});
if (!session) return { ok: false, error: 'Session introuvable.' };

// 4) Transaction : update + AuditLog
await prisma.$transaction([
  prisma.trainingSession.update({ where: { id: parsed.data.sessionId }, data: ... }),
  prisma.auditLog.create({ data: { ..., action: 'sessions.update', diff: { before: {...}, after: {...} } } }),
]);
revalidatePath(`/app/sessions/${parsed.data.sessionId}`);
return { ok: true };
```

Pattern Dialog Radix (cloné de `CreateCreditNoteDialog`) :
```typescript
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// Trigger asChild → bouton Pencil
// Form RHF + zodResolver
// onSubmit → server action → toast + router.refresh() + setOpen(false)
```

Format dates dans le projet (wizard de création — `apps/web/src/components/wizards/session-wizard.tsx` lignes 94-95, 353, 378) :
- Utilise `type="date"` (yyyy-mm-dd), PAS `datetime-local`
- Côté server : `new Date(input.startDate)` — l'heure est à 00:00 UTC par défaut
- **DÉCISION POUR CETTE QUICK : on s'aligne sur `type="date"` pour cohérence wizard, MAIS pour préserver l'horaire d'origine quand on modifie un champ scalaire d'une session existante, la server action reconstruit la DateTime en combinant la nouvelle date (yyyy-mm-dd) avec l'heure/minute déjà stockée en BDD.**

Convention AuditLog `[entity].[verb]` déjà posée :
- `sessionParticipants.delete` (unenrollParticipant)
- `parameters.update` (Phase 7)
- `documents.*` (Phase 9.1)
- `invoices.*` (Phase 11)
→ Nouvelle : **`sessions.update`**

Pattern d'export schémas partagés (`packages/shared/src/schemas/index.ts`) :
```
export * from './session';  // ← à ajouter
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Zod schema partagé + server action updateSessionDetails</name>
  <files>
    packages/shared/src/schemas/session.ts,
    packages/shared/src/schemas/index.ts,
    apps/web/src/server/actions/sessions.ts,
    packages/shared/src/schemas/__tests__/session.test.ts
  </files>
  <behavior>
    Tests Zod (packages/shared/src/schemas/__tests__/session.test.ts) :
    - parse OK : payload complet valide (sessionId UUID + tous les champs)
    - parse OK : payload minimal { sessionId } (tous les autres champs optional → no-op côté server)
    - parse OK : champs optionnels nullable (name: null, pricePerLearner: null, internalNotes: null)
    - reject : sessionId pas UUID
    - reject : endDate < startDate (refine cross-field)
    - reject : capacityMax < capacityMin (refine cross-field)
    - reject : capacityMin < 1
    - reject : pricePerLearner < 0
    - reject : modality hors enum
    - reject : language vide (min 1 char) ou > 8 chars
    - reject : name > 200 chars

    Comportement server action (à valider manuellement en smoke + en lisant le code, pas de test auto vu absence de framework de test server actions dans le projet) :
    - RBAC ADMIN/MANAGER OK
    - RBAC COMMERCIAL rejeté avec message "Rôle COMMERCIAL non autorisé"
    - Tenant scoping : session d'un autre tenant → "Session introuvable."
    - Préservation horaire : si on change startDate de 2026-06-01 et que la session était à 2026-05-15T09:30:00Z, le résultat est 2026-06-01T09:30:00Z (pas T00:00:00Z)
    - AuditLog créé avec action='sessions.update' et diff contenant before/after des SEULS champs modifiés
    - Transaction atomique (update + auditLog en $transaction)
    - revalidatePath déclenché
    - Retour { ok: true } | { ok: false, error: string }
  </behavior>
  <action>
    **1. Créer `packages/shared/src/schemas/session.ts`** :

    ```typescript
    /**
     * Zod schemas centralisés Sessions (Quick task 260523-oze).
     *
     * UpdateSessionDetailsInputSchema : input pour `updateSessionDetails`
     * — édition modale "Modifier la session" sur la fiche session.
     *
     * Tous les champs scalaires éditables sont optional (sauf sessionId) :
     * le client n'envoie QUE ce qui change ; la server action ne touche que
     * ce qui est `!== undefined`. `null` est autorisé pour les vrais nullable
     * BDD (name, pricePerLearner, internalNotes).
     *
     * Pattern cloné des patterns Phase 11 (invoice.ts) et Phase 8 (user.ts).
     */
    import { z } from 'zod';

    // Enum Modality figé sur les 4 valeurs du schema.prisma — pas d'import
    // depuis @qualiof/db dans packages/shared (cycle de deps).
    export const ModalityEnum = z.enum(['PRESENTIEL', 'DISTANCIEL', 'MIXTE', 'ELEARNING']);

    // Date "YYYY-MM-DD" envoyée par <input type="date"> (pattern wizard).
    // L'horaire est reconstruit côté server à partir de la valeur DB existante.
    const DateOnlyString = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

    export const UpdateSessionDetailsInputSchema = z
      .object({
        sessionId: z.string().uuid('sessionId doit être un UUID valide'),
        name: z.string().trim().max(200, 'Nom trop long (200 max)').nullable().optional(),
        startDate: DateOnlyString.optional(),
        endDate: DateOnlyString.optional(),
        capacityMin: z.number().int().min(1, 'Capacité min ≥ 1').optional(),
        capacityMax: z.number().int().min(1, 'Capacité max ≥ 1').optional(),
        modality: ModalityEnum.optional(),
        pricePerLearner: z.number().nonnegative('Prix HT ≥ 0').nullable().optional(),
        language: z.string().trim().min(1, 'Langue obligatoire').max(8, 'Code langue trop long').optional(),
        internalNotes: z.string().nullable().optional(),
      })
      .refine(
        (d) => d.startDate === undefined || d.endDate === undefined || d.endDate >= d.startDate,
        { message: 'Date de fin doit être ≥ date de début.', path: ['endDate'] },
      )
      .refine(
        (d) => d.capacityMin === undefined || d.capacityMax === undefined || d.capacityMax >= d.capacityMin,
        { message: 'Capacité max doit être ≥ capacité min.', path: ['capacityMax'] },
      );

    export type UpdateSessionDetailsInput = z.infer<typeof UpdateSessionDetailsInputSchema>;
    ```

    **2. Étendre `packages/shared/src/schemas/index.ts`** :
    Ajouter en fin de fichier : `export * from './session';`

    **3. Créer les tests `packages/shared/src/schemas/__tests__/session.test.ts`** :
    Cas listés dans `<behavior>`. Suivre le style de `__tests__/invoice.test.ts` (vitest, `describe`/`it`/`expect`, `safeParse` + `success`/`!success`).

    **4. Ajouter la server action `updateSessionDetails` dans `apps/web/src/server/actions/sessions.ts`** (à la fin, après les actions existantes) :

    ```typescript
    import { UpdateSessionDetailsInputSchema, type UpdateSessionDetailsInput } from '@qualiof/shared';

    /**
     * Édite les champs scalaires d'une session depuis la modale "Modifier la session"
     * (Quick task 260523-oze). 9 champs gérés : name, startDate, endDate, capacityMin,
     * capacityMax, modality, pricePerLearner, language, internalNotes.
     *
     * Hors-scope : status (SessionStatusSelect), location (SessionLocationPicker),
     * trainers (SessionTrainerPicker), logistique formateur (SessionLogisticsEditor),
     * slots (sous-modèle multi-lignes, backlog séparé).
     *
     * Pattern strict cloné de `unenrollParticipant` :
     *  - Zod validation en premier
     *  - RBAC ADMIN+MANAGER (édition de champs structurants : prix, dates, capacité)
     *  - Tenant scoping
     *  - Transaction Prisma update + AuditLog atomique
     *  - Convention AuditLog `sessions.update` (entity=[entity].[verb])
     *  - Discriminated return { ok: true } | { ok: false; error: string }
     *
     * Préservation horaire (décision plan 260523-oze) : `<input type="date">` envoie
     * 'YYYY-MM-DD'. Si la session existante a startDate=2026-05-15T09:30:00Z, et que
     * l'utilisateur change la date pour 2026-06-01, on reconstruit le DateTime en
     * combinant la nouvelle date avec l'heure d'origine (09:30 UTC). Évite que toute
     * édition de "juste le nom" remette les dates à T00:00:00.
     */
    export async function updateSessionDetails(
      input: UpdateSessionDetailsInput,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      // 1) Validation Zod
      const parsed = UpdateSessionDetailsInputSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' };
      }
      const data = parsed.data;

      // 2) RBAC ADMIN+MANAGER (édition de champs structurants)
      let user;
      try {
        user = await requireRole(['ADMIN', 'MANAGER']);
      } catch (e) {
        if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
          return { ok: false, error: e.message };
        }
        throw e;
      }

      // 3) Récupération + tenant scoping
      const session = await prisma.trainingSession.findFirst({
        where: { id: data.sessionId, tenantId: user.tenantId },
      });
      if (!session) return { ok: false, error: 'Session introuvable.' };

      // 4) Construction du payload update + diff (only changed fields)
      const updateData: Prisma.TrainingSessionUpdateInput = {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      // Helper : reconstruit un DateTime en préservant l'horaire de la session d'origine.
      // Évite que changer "juste le nom" décale les dates à T00:00:00Z.
      const mergeDateKeepTime = (newDateStr: string, oldDate: Date): Date => {
        const [y, m, d] = newDateStr.split('-').map(Number);
        const merged = new Date(oldDate);
        merged.setUTCFullYear(y!, (m! - 1), d!);
        return merged;
      };

      // name (nullable)
      if (data.name !== undefined) {
        const newName = data.name === null || data.name === '' ? null : data.name;
        if (newName !== session.name) {
          updateData.name = newName;
          before.name = session.name;
          after.name = newName;
        }
      }

      // startDate / endDate avec préservation horaire
      if (data.startDate !== undefined) {
        const newStart = mergeDateKeepTime(data.startDate, session.startDate);
        if (newStart.getTime() !== session.startDate.getTime()) {
          updateData.startDate = newStart;
          before.startDate = session.startDate.toISOString();
          after.startDate = newStart.toISOString();
        }
      }
      if (data.endDate !== undefined) {
        const newEnd = mergeDateKeepTime(data.endDate, session.endDate);
        if (newEnd.getTime() !== session.endDate.getTime()) {
          updateData.endDate = newEnd;
          before.endDate = session.endDate.toISOString();
          after.endDate = newEnd.toISOString();
        }
      }

      // Cross-field validation après merge (refine Zod opère sur les strings,
      // mais ici on doit aussi vérifier vs l'autre date qui n'est PAS dans le payload).
      const finalStart = (updateData.startDate as Date | undefined) ?? session.startDate;
      const finalEnd = (updateData.endDate as Date | undefined) ?? session.endDate;
      if (finalEnd < finalStart) {
        return { ok: false, error: 'Date de fin doit être ≥ date de début.' };
      }

      // capacités avec cross-field final
      if (data.capacityMin !== undefined && data.capacityMin !== session.capacityMin) {
        updateData.capacityMin = data.capacityMin;
        before.capacityMin = session.capacityMin;
        after.capacityMin = data.capacityMin;
      }
      if (data.capacityMax !== undefined && data.capacityMax !== session.capacityMax) {
        updateData.capacityMax = data.capacityMax;
        before.capacityMax = session.capacityMax;
        after.capacityMax = data.capacityMax;
      }
      const finalMin = (updateData.capacityMin as number | undefined) ?? session.capacityMin;
      const finalMax = (updateData.capacityMax as number | undefined) ?? session.capacityMax;
      if (finalMax < finalMin) {
        return { ok: false, error: 'Capacité max doit être ≥ capacité min.' };
      }

      // modality
      if (data.modality !== undefined && data.modality !== session.modality) {
        updateData.modality = data.modality as Modality;
        before.modality = session.modality;
        after.modality = data.modality;
      }

      // pricePerLearner (nullable Decimal)
      if (data.pricePerLearner !== undefined) {
        const newPrice = data.pricePerLearner === null ? null : new Prisma.Decimal(data.pricePerLearner);
        const oldNum = session.pricePerLearner === null ? null : Number(session.pricePerLearner);
        const newNum = data.pricePerLearner;
        if (oldNum !== newNum) {
          updateData.pricePerLearner = newPrice;
          before.pricePerLearner = oldNum;
          after.pricePerLearner = newNum;
        }
      }

      // language
      if (data.language !== undefined && data.language !== session.language) {
        updateData.language = data.language;
        before.language = session.language;
        after.language = data.language;
      }

      // internalNotes (nullable)
      if (data.internalNotes !== undefined) {
        const newNotes = data.internalNotes === null || data.internalNotes === '' ? null : data.internalNotes;
        if (newNotes !== session.internalNotes) {
          updateData.internalNotes = newNotes;
          before.internalNotes = session.internalNotes;
          after.internalNotes = newNotes;
        }
      }

      // No-op si rien n'a changé (évite AuditLog vide)
      if (Object.keys(updateData).length === 0) return { ok: true };

      // 5) Transaction atomique : update + AuditLog
      await prisma.$transaction([
        prisma.trainingSession.update({
          where: { id: data.sessionId },
          data: updateData,
        }),
        prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'TrainingSession',
            entityId: data.sessionId,
            action: 'sessions.update',
            diff: { before, after },
          },
        }),
      ]);

      revalidatePath(`/app/sessions/${data.sessionId}`);
      return { ok: true };
    }
    ```

    **Notes implémentation :**
    - Ajouter l'import `UpdateSessionDetailsInputSchema, UpdateSessionDetailsInput` en haut du fichier (le `Modality` est déjà importé).
    - Pas d'import circulaire : `packages/shared` n'importe PAS de `@qualiof/db`, on duplique l'enum côté Zod (cf. ModalityEnum).
    - Le mergeDateKeepTime utilise setUTCFullYear pour rester en UTC (Prisma stocke en UTC, cf. STATE.md conventions Date).
    - Pas de migration Prisma — tous les champs existent déjà dans TrainingSession.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/shared test -- session.test 2>&1 | tail -40 && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `packages/shared/src/schemas/session.ts` exporte `UpdateSessionDetailsInputSchema` + type `UpdateSessionDetailsInput`
    - `packages/shared/src/schemas/index.ts` ré-exporte le nouveau fichier
    - Tests Zod tous verts (`pnpm --filter @qualiof/shared test -- session.test`)
    - `apps/web/src/server/actions/sessions.ts` exporte `updateSessionDetails`
    - `tsc --noEmit` passe sans erreur dans apps/web
    - Convention AuditLog `sessions.update` documentée en commentaire JSDoc
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2 : Dialog Radix "Modifier la session" + intégration fiche session</name>
  <files>
    apps/web/src/components/sessions/edit-session-details-dialog.tsx,
    apps/web/src/app/app/sessions/[id]/page.tsx
  </files>
  <action>
    **1. Créer `apps/web/src/components/sessions/edit-session-details-dialog.tsx`** :

    Cloner strictement le pattern de `apps/web/src/components/invoices/create-credit-note-dialog.tsx` :
    - `'use client'`
    - `useState` pour `open`, `useTransition` pour `pending`, `useRouter` pour `refresh()`
    - `useForm<UpdateSessionDetailsInput>({ resolver: zodResolver(UpdateSessionDetailsInputSchema), defaultValues: { sessionId, name, startDate, endDate, capacityMin, capacityMax, modality, pricePerLearner, language, internalNotes } })`
    - `Dialog.Trigger asChild` → bouton avec icône `Pencil` (lucide-react), label "Modifier"
    - `Dialog.Content` : largeur 640px (plus large que CreateCreditNoteDialog car 9 champs)
    - Form layout : grid 2 colonnes sur md+ pour les paires (dates, capacités), single column pour name + notes
    - Submit → `await updateSessionDetails(data)` → si `ok` toast vert "Session mise à jour" + `setOpen(false)` + `router.refresh()` ; sinon `toast.error(res.error)`

    **Props attendues :**
    ```typescript
    interface Props {
      sessionId: string;
      initial: {
        name: string | null;
        startDate: Date;       // sera converti yyyy-mm-dd côté defaultValues
        endDate: Date;
        capacityMin: number;
        capacityMax: number;
        modality: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';
        pricePerLearner: number | null;  // converti depuis Decimal côté server component
        language: string;
        internalNotes: string | null;
      };
    }
    ```

    **Helper de conversion Date → yyyy-mm-dd pour defaultValues :**
    ```typescript
    const toDateInput = (d: Date) => {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    ```

    **Champs du form (dans cet ordre) :**

    1. **Nom de la session** (`<input type="text" {...register('name')}>`)
       - Placeholder : "Laissez vide pour autogénération depuis le produit"
       - Aide : "Nom affiché sur la fiche et les documents Qualiopi"

    2. **Modalité** (`<select {...register('modality')}>`) — 4 options PRESENTIEL/DISTANCIEL/MIXTE/ELEARNING (labels FR : "Présentiel", "Distanciel", "Mixte", "E-learning")

    3. **Grid 2 cols** :
       - Date de début (`<input type="date" {...register('startDate')}>`)
       - Date de fin (`<input type="date" {...register('endDate')}>`)
       - Aide sous le bloc : "Les horaires d'origine (heure/minute) sont préservés."

    4. **Grid 2 cols** :
       - Capacité min (`<input type="number" min="1" step="1" {...register('capacityMin', { valueAsNumber: true })}>`)
       - Capacité max (`<input type="number" min="1" step="1" {...register('capacityMax', { valueAsNumber: true })}>`)

    5. **Grid 2 cols** :
       - Prix HT / apprenant (`<input type="number" step="0.01" min="0" {...register('pricePerLearner', { valueAsNumber: true, setValueAs: v => v === '' || Number.isNaN(v) ? null : v })}>`)
       - Aide : "Laisser vide pour 'aucun prix spécifique' (utilise le prix produit)"
       - Langue (`<input type="text" maxLength={8} {...register('language')}>`) — placeholder "fr"

    6. **Notes internes** (`<textarea rows={3} {...register('internalNotes')}>`) — full width

    **Validation client visible** : afficher `errors.{field}?.message` sous chaque champ en `text-xs text-red-600`.

    **Footer dialog :** bouton "Annuler" (Dialog.Close) + bouton submit "Enregistrer" (loading spinner pendant `pending`).

    **Hidden field :** `<input type="hidden" {...register('sessionId')} value={sessionId} />` — ou passer sessionId via defaultValues (préféré).

    **2. Intégrer dans `apps/web/src/app/app/sessions/[id]/page.tsx`** :

    - Ajouter l'import : `import { EditSessionDetailsDialog } from '@/components/sessions/edit-session-details-dialog';` (en haut, près des autres imports de sessions/*)
    - Dans la div `<div className="flex items-center gap-2">` du header (ligne ~390, qui contient déjà `PrepareTrainingButton`, `GenerateClosurePackButton`, `SessionActionsMenu`), insérer le bouton "Modifier" **en premier** (à gauche des autres CTA) **sous condition de rôle** :

    ```tsx
    {['ADMIN', 'MANAGER'].includes(user.role) && (
      <EditSessionDetailsDialog
        sessionId={session.id}
        initial={{
          name: session.name,
          startDate: session.startDate,
          endDate: session.endDate,
          capacityMin: session.capacityMin,
          capacityMax: session.capacityMax,
          modality: session.modality,
          pricePerLearner: session.pricePerLearner === null ? null : Number(session.pricePerLearner),
          language: session.language,
          internalNotes: session.internalNotes,
        }}
      />
    )}
    ```

    Important : `pricePerLearner` est `Decimal | null` côté Prisma → convertir en `number | null` avant de passer côté client (les Decimals ne traversent pas la frontière server→client sans casser).

    **3. Style bouton Trigger** (icône Pencil + label, cohérent avec les autres CTA de la barre) :
    ```tsx
    <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors">
      <Pencil className="h-4 w-4" /> Modifier
    </button>
    ```
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | tail -20 && pnpm --filter @qualiof/web exec next lint --dir src/components/sessions/edit-session-details-dialog.tsx --dir src/app/app/sessions 2>&1 | tail -15</automated>
  </verify>
  <done>
    - `apps/web/src/components/sessions/edit-session-details-dialog.tsx` existe et exporte `EditSessionDetailsDialog`
    - La fiche session affiche un bouton "Modifier" (icône Pencil) près du header pour ADMIN+MANAGER UNIQUEMENT (COMMERCIAL ne voit rien)
    - Le clic ouvre une modale Radix avec 9 champs pré-remplis depuis la session
    - `tsc --noEmit` passe sans erreur
    - `next lint` ne signale aucune erreur sur les fichiers modifiés
    - Smoke test manuel (à valider par Laurent) : ouvrir une session existante, modifier le nom + le prix, submit → toast vert + page rafraîchie avec les nouvelles valeurs ; modifier endDate < startDate → toast rouge "Date de fin doit être ≥ date de début."
  </done>
</task>

</tasks>

<verification>
**Tests automatisés :**
- `pnpm --filter @qualiof/shared test` → tous verts (les nouveaux tests Zod + les 593 existants préservés)
- `pnpm --filter @qualiof/web exec tsc --noEmit` → 0 erreur
- `pnpm --filter @qualiof/web exec next lint --dir src/components/sessions/edit-session-details-dialog.tsx --dir src/app/app/sessions` → 0 warning

**Smoke manuel (Laurent, après livraison) :**
1. En ADMIN : ouvrir une session existante → voir bouton "Modifier" dans le header → cliquer → modale s'ouvre avec valeurs pré-remplies
2. Modifier le nom + le prix HT + endDate → submit → toast vert "Session mise à jour" → modale se ferme → header et résumé reflètent les nouvelles valeurs
3. Tenter endDate < startDate → toast rouge avec message d'erreur clair
4. Tenter capacityMax < capacityMin → toast rouge
5. Modifier UNIQUEMENT le nom → vérifier en BDD (ou via re-ouverture modale) que startDate/endDate ont conservé l'heure d'origine (pas remises à T00:00:00)
6. Vérifier `AuditLog` : `SELECT diff FROM "AuditLog" WHERE action='sessions.update' ORDER BY "createdAt" DESC LIMIT 1` → contient `{before, after}` avec uniquement les champs effectivement modifiés
7. Se reconnecter en COMMERCIAL : le bouton "Modifier" DOIT être absent de la fiche session
</verification>

<success_criteria>
- 9 champs scalaires d'une session éditables en 1 clic via modale "Modifier la session"
- RBAC ADMIN+MANAGER strict (UI + serveur), COMMERCIAL bloqué côté UI et serveur
- AuditLog `sessions.update` créé avec diff précis (avant/après uniquement des champs modifiés)
- Préservation horaire des dates (changer la date conserve heure/minute d'origine)
- Validation cross-field cohérente : endDate ≥ startDate ET capacityMax ≥ capacityMin (Zod + revalidation serveur après merge)
- Pattern cloné strict des conventions existantes (CreateCreditNoteDialog, unenrollParticipant, ModalityEnum dupliqué côté Zod sans cycle de deps)
- Tests Zod verts, tsc + lint clean
- Aucun test existant cassé (593/593 préservés)
- Aucune migration Prisma (champs existent déjà)
</success_criteria>

<output>
Après complétion, créer `.planning/quick/260523-oze-editer-tous-les-champs-scalaires-d-une-s/260523-oze-SUMMARY.md` résumant :
- Fichiers créés/modifiés (5)
- Tests ajoutés
- Convention AuditLog confirmée : `sessions.update`
- Décision dates retenue : `type="date"` + préservation horaire serveur
- Notes pour Laurent (smoke à faire, prochain backlog : slots/créneaux multi-lignes en quick séparé)
</output>
