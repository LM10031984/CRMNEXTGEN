'use client';

/**
 * Phase 13 Plan 04 (VEILLE-03) — Bouton client export PDF audit veille.
 *
 * Déclenche `generateVeilleAuditForTheme(theme)` puis ouvre la clé MinIO
 * retournée dans un nouvel onglet (un lien signé sera servi par une route
 * API séparée — Plan 03 UI s'en occupera).
 *
 * Pattern useTransition + toast (sonner) — cohérent avec
 * `generate-closure-for-participant.tsx` et `exploitation-cell.tsx` (Plan 03).
 *
 * RBAC : la server action `requireRole(['ADMIN','MANAGER'])` rejette les
 * autres rôles → toast.error si LECTEUR tente l'export. Le bouton est
 * néanmoins masqué côté UI (Plan 03) pour les rôles non autorisés.
 */

import { useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateVeilleAuditForTheme } from '@/server/actions/veille-export';

type VeilleTheme = 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';

interface ExportPdfButtonProps {
  theme: VeilleTheme;
  /** Label affiché — défaut "Exporter PDF audit". Permet à Plan 03 de personnaliser par onglet. */
  label?: string;
}

export function ExportPdfButton({ theme, label }: ExportPdfButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await generateVeilleAuditForTheme(theme);
      if (!r.ok) {
        toast.error(r.error || 'Erreur de génération PDF');
        return;
      }
      const sourceCount = r.count;
      const plural = sourceCount > 1 ? 's' : '';
      toast.success(
        `PDF audit généré (${sourceCount} source${plural}). Document tracé en historique.`,
      );
      // Le pdfUrl est la clé MinIO interne (ex: "veille-audit/{tenantId}/INDIC_23-...pdf").
      // Plan 03 (UI) ajoutera une route /api/documents/[id]/download qui sert le
      // signed URL. Pour l'instant on log la clé pour debug et on s'en remet
      // au toast (le user pourra retrouver le doc dans /app/historique).
      if (r.pdfUrl && typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('[veille-export] PDF stocké MinIO :', r.pdfUrl, '| documentId :', r.documentId);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Génère et trace en historique un PDF de l'audit Qualiopi pour ce thème"
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-sm text-foreground hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {pending ? 'Génération…' : label || 'Exporter PDF audit'}
    </button>
  );
}
