'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import type { PathPreview } from '@/lib/proposition/path-options';
import { createProposalFromDiagnostic } from '@/server/actions/propositions';

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const labels: Record<string, string> = {
  diagnostic: 'Priorité du diagnostic',
  socle: 'Socle IA',
  developpement: 'Développement métier avec IA',
};

export function ProposalPathOptions({
  diagnosticId,
  options,
  canCreate,
}: {
  diagnosticId: string;
  options: PathPreview[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acceptedRemainder, setAcceptedRemainder] = useState(false);
  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      aria-labelledby="path-options-title"
    >
      <h2 id="path-options-title" className="text-lg font-semibold">
        Choisir l’ampleur du parcours métier avec IA
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Deux variantes recalculées depuis le diagnostic et les droits actuels. Le choix crée une
        nouvelle proposition ; celle-ci reste conservée.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {options.map((option) => (
          <article key={option.mode} className="rounded-lg border border-border p-4">
            <h3 className="font-semibold">
              {option.mode === 'PRIORITAIRE'
                ? 'Parcours prioritaire'
                : 'Parcours complet métier + IA'}
            </h3>
            <p className="mt-1 text-sm">
              {option.modules.length} ateliers · {option.halfDays} demi-journées
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
              <dt>Coût pédagogique HT</dt>
              <dd className="text-right">{eur.format(option.totalHt)}</dd>
              <dt>Financement estimé</dt>
              <dd className="text-right">{eur.format(option.coverage)}</dd>
              <dt>Budget restant</dt>
              <dd className="text-right">{eur.format(option.remainingBudget)}</dd>
              <dt className="font-semibold">Reste à charge</dt>
              <dd className="text-right font-semibold">{eur.format(option.remainder)}</dd>
            </dl>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Voir les ateliers et leur justification
              </summary>
              <ol className="mt-2 space-y-3">
                {option.modules.map((m) => (
                  <li key={m.id}>
                    <p className="font-medium">
                      {m.title}{' '}
                      <span className="font-normal text-muted-foreground">· {m.minutes} min</span>
                    </p>
                    <p className="text-xs font-medium">{labels[m.kind]}</p>
                    <p className="text-xs text-muted-foreground">{m.rationale}</p>
                  </li>
                ))}
              </ol>
            </details>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">Détail des enveloppes</summary>
              <ul className="mt-2 space-y-2">
                {option.budgets.map((b, i) => (
                  <li key={i}>
                    <p className="font-medium">{b.label}</p>
                    <p className="text-xs">
                      {eur.format(b.used)} mobilisés sur {eur.format(b.available)} ·{' '}
                      {eur.format(b.remaining)} disponibles · {eur.format(b.remainder)} à charge
                    </p>
                  </li>
                ))}
              </ul>
            </details>
            {option.remainingBudget > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Le budget restant n’est pas consommé automatiquement. Le volume dépend des ateliers
                pertinents disponibles et des plafonds de chaque dossier.
              </p>
            )}
            {option.uncoveredNeeds.length > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                Besoins restant à traiter : {option.uncoveredNeeds.join(' · ')}.
              </p>
            )}
            {option.mode === 'COMPLET_IA' && option.remainder > 0 && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acceptedRemainder}
                  onChange={(e) => setAcceptedRemainder(e.target.checked)}
                  className="mt-1"
                />
                Je retiens cette variante avec {eur.format(option.remainder)} de reste à charge
                estimé.
              </label>
            )}
            <button
              type="button"
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={
                !canCreate ||
                pending ||
                option.modules.length === 0 ||
                (option.mode === 'COMPLET_IA' && option.remainder > 0 && !acceptedRemainder)
              }
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await createProposalFromDiagnostic(diagnosticId, option.mode);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    if (result.data) {
                      toast.success('Nouvelle proposition créée');
                      router.push(`/app/propositions/${result.data.proposalId}` as Route);
                    }
                  } catch {
                    toast.error(
                      'La création a échoué. Réessayez après avoir vérifié votre connexion.',
                    );
                  }
                })
              }
            >
              {pending ? 'Création…' : 'Créer cette variante'}
            </button>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Estimation sous réserve des droits disponibles et de l’accord des financeurs. Les enveloppes
        sont propres à chaque payeur.
      </p>
    </section>
  );
}
