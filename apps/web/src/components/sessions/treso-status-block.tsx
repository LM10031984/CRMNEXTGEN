/**
 * Bloc Trésorerie / Suivi OPCO sur la fiche session.
 *
 * Affiche les 4 statuts encaissement (importés depuis le suivi Excel "Tréso
 * AGEFICE" de Start Academy — cf scripts/match-treso-agefice.ts) pour chaque
 * apprenant inscrit :
 *
 *   1. Facture envoyée   → l'OF a émis la facture vers AGEFICE/OPCO
 *   2. Validation OPCO   → l'OPCO a validé le dossier
 *   3. Remboursement OPCO → l'OPCO a versé l'apprenant
 *   4. Paiement client   → l'apprenant a réglé Start Academy
 *
 * Couleur progressive : gris (pas encore) → vert (fait).
 */

import { Wallet, Check, Clock } from 'lucide-react';

interface ParticipantStatus {
  id: string;
  personName: string;
  factureEnvoyee: boolean;
  validationOpco: boolean;
  remboursementOpco: boolean;
  paiementClient: boolean;
}

interface Props {
  participants: ParticipantStatus[];
}

const STEPS = [
  { key: 'factureEnvoyee' as const, label: 'Facture envoyée' },
  { key: 'validationOpco' as const, label: 'Validation OPCO' },
  { key: 'remboursementOpco' as const, label: 'Remb. OPCO' },
  { key: 'paiementClient' as const, label: 'Paiement client' },
];

export function TresoStatusBlock({ participants }: Props) {
  if (participants.length === 0) return null;
  // Skip si TOUT est à false (pas de données Tréso pour cette session)
  const anyData = participants.some(
    (p) => p.factureEnvoyee || p.validationOpco || p.remboursementOpco || p.paiementClient,
  );
  if (!anyData) return null;

  return (
    <section
      aria-labelledby="treso-status-heading"
      className="rounded-2xl border border-border bg-white p-5"
    >
      <h2
        id="treso-status-heading"
        className="font-semibold inline-flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground mb-3"
      >
        <Wallet className="h-4 w-4" aria-hidden="true" /> Trésorerie & suivi OPCO
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Importé depuis le suivi Excel <em>Tréso AGEFICE</em>. Source de vérité encaissement.
      </p>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="text-left px-2 py-2 font-semibold">Apprenant</th>
              {STEPS.map((s) => (
                <th key={s.key} className="text-center px-2 py-2 font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {participants.map((p) => (
              <tr key={p.id}>
                <td className="px-2 py-1.5 font-medium">{p.personName}</td>
                {STEPS.map((s) => {
                  const done = p[s.key];
                  return (
                    <td key={s.key} className="text-center px-2 py-1.5">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full border ${
                          done
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                        title={done ? `${s.label} ✓` : `${s.label} — en attente`}
                      >
                        {done ? (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
