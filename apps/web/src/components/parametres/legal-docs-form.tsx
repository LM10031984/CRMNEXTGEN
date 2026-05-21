'use client';

/**
 * LegalDocsForm (BUG-15).
 *
 * Édite les 2 docs légaux statiques tenant :
 *  - CGV (Conditions Générales de Vente — Qualiopi indic 1)
 *  - Règlement intérieur (indic 9)
 *
 * Stocké en markdown (textarea simple). Rendu PDF via marked + paged footer.
 * Limite 50 000 chars (validation côté Zod).
 *
 * Pattern : clone-light de InvoiceSettingsForm (Plan 11-04) — RHF + useTransition
 * + toast sonner. Pas d'éditeur markdown riche (trop de surface pour V1), juste
 * un textarea avec hint "tu peux coller du markdown".
 */

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import {
  tenantLegalDocsSchema,
  type TenantLegalDocsInput,
} from '@qualiof/shared';
import { updateTenantLegalDocs } from '@/server/actions/tenant-settings';
import {
  generateCgvForTenant,
  generateReglementInterieurForTenant,
} from '@/server/actions/legal-docs-generator';

interface Props {
  initial: {
    cgvMarkdown: string | null;
    reglementInterieurMarkdown: string | null;
  };
  onSaved?: () => void;
  onCancel?: () => void;
}

export function LegalDocsForm({ initial, onSaved, onCancel }: Props) {
  const [isPending, startTransition] = useTransition();
  const [isGeneratingCgv, startCgv] = useTransition();
  const [isGeneratingRi, startRi] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TenantLegalDocsInput>({
    defaultValues: {
      cgvMarkdown: initial.cgvMarkdown ?? '',
      reglementInterieurMarkdown: initial.reglementInterieurMarkdown ?? '',
    },
  });

  const onSubmit = handleSubmit((data) => {
    const parsed = tenantLegalDocsSchema.safeParse(data);
    if (!parsed.success) {
      toast.error('Données invalides');
      return;
    }
    startTransition(async () => {
      const r = await updateTenantLegalDocs(parsed.data);
      if (r.ok) {
        toast.success('Documents légaux mis à jour');
        onSaved?.();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  });

  function handleDownloadCgv() {
    startCgv(async () => {
      const r = await generateCgvForTenant();
      if (r.ok && r.documentId) {
        window.open(`/api/documents/${r.documentId}`, '_blank');
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleDownloadRi() {
    startRi(async () => {
      const r = await generateReglementInterieurForTenant();
      if (r.ok && r.documentId) {
        window.open(`/api/documents/${r.documentId}`, '_blank');
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="cgvMarkdown" className="text-sm font-medium">
            Conditions Générales de Vente
          </label>
          <button
            type="button"
            onClick={handleDownloadCgv}
            disabled={isGeneratingCgv}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            title="Générer un PDF à jour avec le markdown saisi"
          >
            <Download className="h-3 w-3" /> {isGeneratingCgv ? 'Génération…' : 'Aperçu PDF'}
          </button>
        </div>
        <textarea
          id="cgvMarkdown"
          {...register('cgvMarkdown')}
          rows={10}
          disabled={isPending}
          placeholder="# Article 1 — Objet&#10;&#10;Les présentes conditions générales de vente régissent…&#10;&#10;## Article 2 — Inscription&#10;&#10;Toute inscription à une formation…"
          className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Markdown supporté (titres ##, listes, **gras**, *italique*). Max 50000 caractères.
        </p>
        {errors.cgvMarkdown && (
          <p className="text-xs text-red-600 mt-1">{errors.cgvMarkdown.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="reglementInterieurMarkdown" className="text-sm font-medium">
            Règlement intérieur
          </label>
          <button
            type="button"
            onClick={handleDownloadRi}
            disabled={isGeneratingRi}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          >
            <Download className="h-3 w-3" /> {isGeneratingRi ? 'Génération…' : 'Aperçu PDF'}
          </button>
        </div>
        <textarea
          id="reglementInterieurMarkdown"
          {...register('reglementInterieurMarkdown')}
          rows={10}
          disabled={isPending}
          placeholder="# Règlement intérieur de l'organisme de formation&#10;&#10;## Article 1 — Discipline&#10;&#10;Les stagiaires sont tenus de respecter les horaires de la formation…"
          className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Indicateur Qualiopi 9 — info déroulement prestation. Distribué aux stagiaires en début de formation.
        </p>
        {errors.reglementInterieurMarkdown && (
          <p className="text-xs text-red-600 mt-1">{errors.reglementInterieurMarkdown.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-9 px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {isPending ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
