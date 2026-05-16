'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { CreateLeadSchema, type CreateLeadInput } from '@qualiof/shared';
import { createLead } from '@/server/actions/leads';

/**
 * Form création Lead (Phase 9 Plan 09-03 — LEAD-01).
 *
 * Pattern Phase 8 cloné (InviteUserButton — RHF + zodResolver) :
 *  - `react-hook-form` pour state local + validation côté client.
 *  - `zodResolver(CreateLeadSchema)` : validation Zod identique côté UI et serveur,
 *    refine `personId XOR firstName+lastName` (cf. packages/shared/src/schemas/lead.ts).
 *  - Sur submit : `createLead(data)` server action (Plan 09-02), redirige vers la
 *    fiche du lead créé en cas de succès.
 *  - `useTransition` pour le pending state (compatible RSC).
 */
export function LeadCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateLeadInput>({
    resolver: zodResolver(CreateLeadSchema),
    defaultValues: { status: 'NEW', priority: 'MEDIUM' },
  });

  function onSubmit(data: CreateLeadInput) {
    startTransition(async () => {
      const r = await createLead(data);
      if (r.ok && r.data) {
        toast.success('Lead créé');
        router.push(`/app/leads/${r.data.leadId}` as any);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Prénom</label>
          <input
            {...register('firstName')}
            className="w-full px-3 py-2 rounded-md border border-border"
          />
          {errors.firstName && (
            <p className="text-xs text-red-600 mt-1">
              {errors.firstName.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nom *</label>
          <input
            {...register('lastName')}
            className="w-full px-3 py-2 rounded-md border border-border"
          />
          {errors.lastName && (
            <p className="text-xs text-red-600 mt-1">
              {errors.lastName.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            {...register('email')}
            className="w-full px-3 py-2 rounded-md border border-border"
          />
          {errors.email && (
            <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Téléphone</label>
          <input
            {...register('phone')}
            className="w-full px-3 py-2 rounded-md border border-border"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Source</label>
          <input
            {...register('source')}
            placeholder="LinkedIn, Salon, Recommandation, Formulaire public…"
            className="w-full px-3 py-2 rounded-md border border-border"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-border"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Création…
            </>
          ) : (
            'Créer le lead'
          )}
        </button>
      </div>
    </form>
  );
}
