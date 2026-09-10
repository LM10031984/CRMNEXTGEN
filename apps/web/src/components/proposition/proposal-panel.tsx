'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, FileSignature, Loader2 } from 'lucide-react';

import { createProposalFromDiagnostic } from '@/server/actions/propositions';

/**
 * La proposition, vue depuis la fiche diagnostic.
 *
 * C'est le passage de relais du R1 au R2 : on ne repart pas d'une page vide,
 * la proposition naît du diagnostic — ses constats, son volume, ses droits.
 */
export function ProposalPanel({
  diagnosticId,
  proposals,
  canCreate,
}: {
  diagnosticId: string;
  proposals: { id: string; reference: string; status: string; totalHt: number | null }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const eur = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileSignature className="h-4 w-4" aria-hidden />
          Proposition
        </h2>
        <span className="text-xs text-muted-foreground">
          le chiffrage remis en R2 — et les devis qui en sortent
        </span>
      </header>

      <div className="space-y-3 p-4">
        {proposals.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune proposition. Elle sera composée depuis ce diagnostic : les constats, le volume
            dimensionné sur les droits, et les lignes par payeur.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {proposals.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/propositions/${p.id}` as Route}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-mono">{p.reference}</span>
                  <span className="text-xs text-muted-foreground">{p.status.toLowerCase()}</span>
                  <span className="ml-auto tabular-nums">
                    {p.totalHt === null ? '—' : eur.format(p.totalHt)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <button
            type="button"
            onClick={() =>
              start(async () => {
                const r = await createProposalFromDiagnostic(diagnosticId);
                if (r.ok && r.data) {
                  for (const notice of r.data.notices) toast.warning(notice);
                  toast.success(`${r.data.reference} créée`);
                  router.push(`/app/propositions/${r.data.proposalId}` as Route);
                } else if (!r.ok) {
                  toast.error(r.error);
                }
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSignature className="h-4 w-4" />
            )}
            {proposals.length > 0 ? 'Créer une nouvelle proposition' : 'Composer la proposition'}
          </button>
        )}
      </div>
    </section>
  );
}
