---
phase: 11-factures-cycle-complet
plan: 04
type: execute
wave: 1
depends_on:
  - "11-00"
files_modified:
  - packages/shared/src/schemas/invoice.ts
  - packages/shared/src/index.ts
  - apps/web/src/server/actions/invoice-settings.ts
  - apps/web/src/server/actions/__tests__/invoice-settings.test.ts
  - apps/web/src/app/app/parametres/page.tsx
  - apps/web/src/components/parametres/invoice-settings-form.tsx
  - apps/web/src/components/parametres/__tests__/invoice-settings-form.test.ts
autonomous: true
requirements:
  - FACT-02
  - FACT-03
must_haves:
  truths:
    - "Section 'Facturation' dans /app/parametres édite invoicePrefix (existant), creditNotePrefix (nouveau), invoiceReminderDays (nouveau)."
    - "Validation Zod : invoiceReminderDays = array 1-3 entiers positifs strictement croissants ; creditNotePrefix = 1-8 chars [A-Z0-9]."
    - "RBAC ADMIN-only sur updateInvoiceReminderSettings (cohérent Phase 7)."
  artifacts:
    - path: "packages/shared/src/schemas/invoice.ts"
      provides: "Schémas Zod InvoiceReminderSettingsSchema + CreateCreditNoteSchema + ExportInvoicesQuerySchema"
      exports: ["InvoiceReminderSettingsSchema", "CreateCreditNoteSchema", "ExportInvoicesQuerySchema"]
    - path: "apps/web/src/server/actions/invoice-settings.ts"
      provides: "Server action updateInvoiceReminderSettings ADMIN-only avec AuditLog parameters.update"
      exports: ["updateInvoiceReminderSettings"]
    - path: "apps/web/src/components/parametres/invoice-settings-form.tsx"
      provides: "UI form RHF + zodResolver pour 3 champs (invoicePrefix readonly Phase 7 / creditNotePrefix / invoiceReminderDays)"
  key_links:
    - from: "Plan 11-06 worker"
      to: "Tenant.invoiceReminderDays"
      via: "prisma.tenant.findUnique select invoiceReminderDays"
      pattern: "invoiceReminderDays"
    - from: "Plan 11-05 createCreditNote"
      to: "Tenant.creditNotePrefix"
      via: "getNextCreditNoteNumber"
      pattern: "creditNotePrefix"
---

<objective>
Étendre la page `/app/parametres` (Phase 7) avec une section "Facturation" éditable ADMIN-only permettant de configurer `creditNotePrefix` (préfixe avoirs) et `invoiceReminderDays` (délais de relance). La section `invoicePrefix` (Phase 7-04) existe déjà et reste intacte — on l'enrichit avec 2 nouveaux champs.

Purpose: Les Plans 11-05 (créer avoir) et 11-06 (worker relances) dépendent de la lecture de ces 2 colonnes Tenant. Sans cette UI, Laurent ne pourrait que SQL-éditer la BDD.
Output: 3 Zod schemas centralisés (réutilisés Plans 11-05 / 11-06 / 11-07) + server action ADMIN-only + section UI dans Paramètres.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@packages/shared/src/schemas/tenant.ts
@apps/web/src/server/actions/tenant-settings.ts
@apps/web/src/app/app/parametres/page.tsx
@apps/web/src/lib/rbac.ts

<interfaces>
<!-- Schémas Zod cibles (D-03 + D-10) -->

```typescript
import { z } from 'zod';

export const CreateCreditNoteSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  amountHtToCredit: z.number().positive().finite(),
  motif: z.string().trim().min(3, 'Motif obligatoire (3 caractères minimum)').max(500),
});
export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteSchema>;

export const InvoiceReminderSettingsSchema = z.object({
  invoiceReminderDays: z.array(z.number().int().positive())
    .min(1, 'Au moins 1 délai requis')
    .max(3, 'Maximum 3 délais')
    .refine(arr => arr.every((v, i) => i === 0 || v > arr[i - 1]!), 'Les délais doivent être strictement croissants'),
  creditNotePrefix: z.string().trim().min(1).max(8).regex(/^[A-Z0-9]+$/).optional(),
});
export type InvoiceReminderSettingsInput = z.infer<typeof InvoiceReminderSettingsSchema>;

export const ExportInvoicesQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  statuses: z.array(z.string()).optional(),
});
```

<!-- Server action cible -->
```typescript
export async function updateInvoiceReminderSettings(
  input: InvoiceReminderSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }>;
// RBAC : ['ADMIN'] (Phase 7 cohérence)
// Side-effect : logTenantSettingsChange (Phase 7 helper) action='parameters.update'
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Zod schemas (packages/shared)</name>
  <files>packages/shared/src/schemas/invoice.ts, packages/shared/src/index.ts, packages/shared/src/schemas/__tests__/invoice.test.ts</files>
  <read_first>
    - packages/shared/src/schemas/tenant.ts (pattern Phase 7 — 4 schémas tenant + exports depuis index)
    - packages/shared/src/index.ts (vérifier exports actuels — pattern `export * from './schemas/tenant'`)
    - packages/shared/src/schemas/__tests__/tenant.test.ts (pattern test Zod Phase 7)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Zod schemas
  </read_first>
  <behavior>
    - Test 1 : `CreateCreditNoteSchema` accepte input valide (uuid + positive + motif ≥3 chars)
    - Test 2 : `CreateCreditNoteSchema` rejette motif vide ou < 3 chars
    - Test 3 : `CreateCreditNoteSchema` rejette amountHtToCredit négatif ou 0
    - Test 4 : `InvoiceReminderSettingsSchema.invoiceReminderDays` accepte `[30, 45]`
    - Test 5 : Rejette `[]` (min 1)
    - Test 6 : Rejette `[30, 45, 60, 90]` (max 3)
    - Test 7 : Rejette `[45, 30]` (non strictement croissant)
    - Test 8 : Rejette `[30, 30]` (non strict)
    - Test 9 : `creditNotePrefix='AVO'` accepté
    - Test 10 : `creditNotePrefix='avo'` rejeté (regex /^[A-Z0-9]+$/)
    - Test 11 : `creditNotePrefix='TROPLONG12'` rejeté (max 8)
    - Test 12 : `ExportInvoicesQuerySchema` coerce string ISO → Date
  </behavior>
  <action>
1. Créer `packages/shared/src/schemas/invoice.ts` :

```typescript
import { z } from 'zod';

export const CreateCreditNoteSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  amountHtToCredit: z.number().positive().finite(),
  motif: z.string().trim().min(3, 'Motif obligatoire (3 caractères minimum)').max(500),
});
export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteSchema>;

export const InvoiceReminderSettingsSchema = z.object({
  invoiceReminderDays: z.array(z.number().int().positive())
    .min(1, 'Au moins 1 délai requis')
    .max(3, 'Maximum 3 délais')
    .refine(
      (arr) => arr.every((v, i) => i === 0 || v > arr[i - 1]!),
      'Les délais doivent être strictement croissants',
    ),
  creditNotePrefix: z
    .string()
    .trim()
    .min(1)
    .max(8)
    .regex(/^[A-Z0-9]+$/, 'Préfixe : majuscules + chiffres uniquement')
    .optional(),
});
export type InvoiceReminderSettingsInput = z.infer<typeof InvoiceReminderSettingsSchema>;

export const ExportInvoicesQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  statuses: z.array(z.string()).optional(),
});
export type ExportInvoicesQueryInput = z.infer<typeof ExportInvoicesQuerySchema>;
```

2. Éditer `packages/shared/src/index.ts` pour ajouter `export * from './schemas/invoice';` (à la suite des exports existants Phase 7/8/9/9.1).

3. Créer `packages/shared/src/schemas/__tests__/invoice.test.ts` avec 12 tests (cf behavior ci-dessus) — pattern clone-strict tenant.test.ts.

4. Lancer : `pnpm --filter @qualiof/shared test -- --run src/schemas/__tests__/invoice.test.ts` → 12 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/shared test -- --run src/schemas/__tests__/invoice.test.ts && grep -q "InvoiceReminderSettingsSchema" packages/shared/src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/shared/src/schemas/invoice.ts` existe avec 3 schémas exportés (grep `export const CreateCreditNoteSchema`, `InvoiceReminderSettingsSchema`, `ExportInvoicesQuerySchema`)
    - `packages/shared/src/index.ts` contient `export * from './schemas/invoice';` (grep)
    - `InvoiceReminderSettingsSchema` contient `.refine` avec message `'Les délais doivent être strictement croissants'` (grep)
    - `creditNotePrefix` regex `/^[A-Z0-9]+$/` (grep)
    - 12/12 tests Vitest verts
  </acceptance_criteria>
  <done>Schémas Zod centralisés exportés. Plans 11-05/06/07 peuvent maintenant `import { CreateCreditNoteSchema, InvoiceReminderSettingsSchema, ExportInvoicesQuerySchema } from '@qualiof/shared'`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 : Server action updateInvoiceReminderSettings ADMIN-only</name>
  <files>apps/web/src/server/actions/invoice-settings.ts, apps/web/src/server/actions/__tests__/invoice-settings.test.ts</files>
  <read_first>
    - apps/web/src/server/actions/tenant-settings.ts (pattern Phase 7 — `updateTenantBilling` ADMIN-only + `logTenantSettingsChange`)
    - apps/web/src/lib/rbac.ts (helper `requireRole(['ADMIN'])` + UnauthorizedError + ForbiddenError)
    - apps/web/src/lib/audit-log.ts (helper logTenantSettingsChange Phase 7 + computeDiff)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Server Actions Inventory L607-614
  </read_first>
  <behavior>
    - Test 1 : Input valide ADMIN → `{ ok: true }` + Tenant update + AuditLog `parameters.update`
    - Test 2 : RBAC MANAGER → `{ ok: false, error: 'Forbidden' }` (ou message similaire)
    - Test 3 : RBAC unauthenticated → `{ ok: false, error: 'Unauthorized' }`
    - Test 4 : Input invalide (Zod) → `{ ok: false, error: <messages flatten> }`
    - Test 5 : revalidatePath('/app/parametres') appelé
    - Test 6 : computeDiff before/after passé à logTenantSettingsChange (cohérent Phase 7)
  </behavior>
  <action>
1. Créer `apps/web/src/server/actions/invoice-settings.ts` :

```typescript
'use server';

import { prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { InvoiceReminderSettingsSchema, type InvoiceReminderSettingsInput } from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { logTenantSettingsChange, computeDiff } from '@/lib/audit-log';

export async function updateInvoiceReminderSettings(
  input: InvoiceReminderSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = InvoiceReminderSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: JSON.stringify(parsed.error.flatten()) };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { invoiceReminderDays: true, creditNotePrefix: true },
  });

  const updated = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      invoiceReminderDays: parsed.data.invoiceReminderDays,
      ...(parsed.data.creditNotePrefix !== undefined
        ? { creditNotePrefix: parsed.data.creditNotePrefix }
        : {}),
    },
    select: { invoiceReminderDays: true, creditNotePrefix: true },
  });

  await logTenantSettingsChange({
    tenantId: user.tenantId,
    actorUserId: user.id,
    diff: computeDiff(before ?? {}, updated),
  });

  revalidatePath('/app/parametres');
  return { ok: true };
}
```

NOTE : Réutilise `logTenantSettingsChange` Phase 7 (entity='Tenant', action='parameters.update') — PAS `logInvoiceEvent` car on édite la config tenant, pas une facture.

2. Créer `apps/web/src/server/actions/__tests__/invoice-settings.test.ts` avec 6 tests (cf behavior). Pattern clone-strict de `apps/web/src/server/actions/__tests__/tenant-settings.test.ts` Phase 7 (mock rbac.requireRole, mock prisma.tenant.update, mock logTenantSettingsChange, mock revalidatePath).

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoice-settings.test.ts` → 6 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoice-settings.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/server/actions/invoice-settings.ts` existe avec `'use server'` directive en haut
    - Exporte `updateInvoiceReminderSettings` (grep `export async function updateInvoiceReminderSettings`)
    - Appelle `requireRole(['ADMIN'])` (grep)
    - Parse via `InvoiceReminderSettingsSchema.safeParse` (grep)
    - Appelle `logTenantSettingsChange` Phase 7 (grep `logTenantSettingsChange`)
    - Appelle `revalidatePath('/app/parametres')` (grep)
    - 6/6 tests verts
  </acceptance_criteria>
  <done>Server action ADMIN-only en place, validation Zod stricte, AuditLog Phase 7 réutilisé.</done>
</task>

<task type="auto">
  <name>Task 3 : UI form section "Facturation" dans page Paramètres</name>
  <files>apps/web/src/components/parametres/invoice-settings-form.tsx, apps/web/src/components/parametres/__tests__/invoice-settings-form.test.ts, apps/web/src/app/app/parametres/page.tsx</files>
  <read_first>
    - apps/web/src/app/app/parametres/page.tsx (page Server Component Phase 7-04 — orchestre 6 SettingsSection : Identity/Address/Assets/Invoicing/Banking/Email — à étendre avec section Facturation)
    - apps/web/src/components/parametres (3-4 form components existants Phase 7-04 — pattern client RHF + zodResolver + useTransition + sonner toast — à cloner)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §UI Components (section "Paramètres")
  </read_first>
  <action>
1. Créer `apps/web/src/components/parametres/invoice-settings-form.tsx` (Client Component) :

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { InvoiceReminderSettingsSchema, type InvoiceReminderSettingsInput } from '@qualiof/shared';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { updateInvoiceReminderSettings } from '@/server/actions/invoice-settings';

interface Props {
  initial: {
    invoiceReminderDays: number[];
    creditNotePrefix: string | null;
  };
}

export function InvoiceSettingsForm({ initial }: Props) {
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    invoiceReminderDaysCsv: string;
    creditNotePrefix: string;
  }>({
    defaultValues: {
      invoiceReminderDaysCsv: initial.invoiceReminderDays.join(', '),
      creditNotePrefix: initial.creditNotePrefix ?? 'AVO',
    },
  });

  const onSubmit = handleSubmit((data) => {
    // Parse CSV "30, 45" → [30, 45]
    const days = data.invoiceReminderDaysCsv
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    const parsed = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: days,
      creditNotePrefix: data.creditNotePrefix.toUpperCase(),
    });

    if (!parsed.success) {
      toast.error('Validation échouée : ' + parsed.error.errors[0]?.message);
      return;
    }

    startTransition(async () => {
      const res = await updateInvoiceReminderSettings(parsed.data);
      if (res.ok) toast.success('Paramètres facturation enregistrés');
      else toast.error(res.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="creditNotePrefix">
          Préfixe avoirs
        </label>
        <input
          id="creditNotePrefix"
          type="text"
          maxLength={8}
          {...register('creditNotePrefix')}
          className="w-32 rounded border border-slate-300 px-3 py-2 font-mono"
          aria-describedby="creditNotePrefix-help"
        />
        <p id="creditNotePrefix-help" className="text-xs text-slate-500 mt-1">
          Format : majuscules + chiffres uniquement (1-8 caractères). Ex : AVO, NC, AV2026.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="invoiceReminderDaysCsv">
          Délais de relance (jours après échéance)
        </label>
        <input
          id="invoiceReminderDaysCsv"
          type="text"
          {...register('invoiceReminderDaysCsv')}
          className="w-48 rounded border border-slate-300 px-3 py-2"
          placeholder="30, 45"
          aria-describedby="reminder-days-help"
        />
        <p id="reminder-days-help" className="text-xs text-slate-500 mt-1">
          Liste de 1 à 3 délais strictement croissants (ex : 30, 45 ou 30, 45, 60).
          Niveau 1 (amical) au premier délai, niveau 2 (ferme) au second, etc.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary-600 text-white px-4 py-2 disabled:opacity-50"
      >
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
```

2. Éditer `apps/web/src/app/app/parametres/page.tsx` pour ajouter une nouvelle section "Facturation" (en plus des sections existantes Phase 7) :
   - Lire `tenant.invoiceReminderDays` et `tenant.creditNotePrefix` dans le select existant de la page
   - Ajouter un `<SettingsSection title="Facturation — Relances et avoirs">` qui wrappe `<InvoiceSettingsForm initial={{ invoiceReminderDays: tenant.invoiceReminderDays, creditNotePrefix: tenant.creditNotePrefix }} />`
   - Placer la section APRÈS la section "Numérotation factures" existante (cohérence métier)
   - **NE PAS** retirer ou modifier les sections existantes Phase 7-04 (anti-régression)

3. Créer `apps/web/src/components/parametres/__tests__/invoice-settings-form.test.ts` (test source-regex D-Phase9-N — pas Testing Library) :
   - Test 1 : `'use client'` directive présente
   - Test 2 : Imports `InvoiceReminderSettingsSchema`, `updateInvoiceReminderSettings`, `useForm`, `zodResolver` (anti-régression Phase 7)
   - Test 3 : Contient les 2 inputs identifiés `creditNotePrefix` + `invoiceReminderDaysCsv`
   - Test 4 : Disabled `isPending` sur le bouton submit

4. Lancer : `pnpm --filter @qualiof/web test -- --run src/components/parametres/__tests__/invoice-settings-form.test.ts` → vert.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/components/parametres/__tests__/invoice-settings-form.test.ts && pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/components/parametres/invoice-settings-form.tsx` existe (ls)
    - Contient `'use client'` directive en première ligne (grep)
    - Importe `InvoiceReminderSettingsSchema` depuis `@qualiof/shared` (grep)
    - Importe `updateInvoiceReminderSettings` depuis `@/server/actions/invoice-settings` (grep)
    - Contient `<input id="creditNotePrefix"` et `<input id="invoiceReminderDaysCsv"` (grep)
    - `apps/web/src/app/app/parametres/page.tsx` contient `<InvoiceSettingsForm initial=` (grep)
    - Section "Facturation — Relances et avoirs" ajoutée dans la page (grep)
    - 4/4 tests verts
    - `pnpm --filter @qualiof/web typecheck` → exit 0
    - `pnpm --filter @qualiof/web build` route `/app/parametres` compile (anti-régression Phase 7-04)
  </acceptance_criteria>
  <done>Section UI fonctionnelle, validation client + serveur, AuditLog Phase 7 utilisé, tests verts.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/shared test -- --run src/schemas/__tests__/invoice.test.ts` → 12/12
- `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoice-settings.test.ts` → 6/6
- `pnpm --filter @qualiof/web test -- --run src/components/parametres/__tests__/invoice-settings-form.test.ts` → 4/4
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web build` route `/app/parametres` compile
- Tests Phase 7 tenant-settings inchangés (anti-régression)
</verification>

<success_criteria>
- 3 schémas Zod centralisés exportés depuis `@qualiof/shared`
- Server action `updateInvoiceReminderSettings` ADMIN-only avec AuditLog Phase 7
- Section UI "Facturation" dans `/app/parametres` avec validation client + serveur
- 22 tests Vitest verts (12 + 6 + 4)
- Anti-régression Phase 7-04 : autres sections de Paramètres intactes
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-04-SUMMARY.md`
</output>
