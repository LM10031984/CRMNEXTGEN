/**
 * Compteur Budget AGEFICE — montant consommé sur l'année où le dossier a été
 * monté (financingRequestDate) vs plafond 3 000 €. Cf
 * feedback_budget_agefice_annee_dossier.
 */

import Link from 'next/link';
import { Wallet, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PLAFOND_AGEFICE = 3000;

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

interface SessionLine {
  participantId: string;
  sessionId: string;
  sessionCode: string;
  sessionName: string;
  startDate: Date;
  amountHT: number;
}

export function BudgetAgefice({
  year,
  consomme,
  sessions,
}: {
  year: number;
  consomme: number;
  sessions: SessionLine[];
}) {
  const restant = Math.max(0, PLAFOND_AGEFICE - consomme);
  const pct = Math.min(100, Math.round((consomme / PLAFOND_AGEFICE) * 100));
  const depassement = consomme > PLAFOND_AGEFICE;

  const barColor = depassement
    ? 'bg-red-500'
    : pct >= 90
      ? 'bg-orange-500'
      : pct >= 60
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Budget AGEFICE {year}
        </h2>
        {depassement ? (
          <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Plafond dépassé
          </span>
        ) : pct >= 90 ? (
          <span className="inline-flex items-center gap-1 text-xs text-orange-700 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Plafond presque atteint
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {fmtEUR.format(restant)} restant
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold tabular-nums">{fmtEUR.format(consomme)}</span>
        <span className="text-sm text-muted-foreground">/ {fmtEUR.format(PLAFOND_AGEFICE)} HT</span>
        <span
          className={cn(
            'ml-auto text-xs font-medium tabular-nums',
            depassement ? 'text-red-700' : pct >= 90 ? 'text-orange-700' : 'text-muted-foreground',
          )}
        >
          {pct}% consommé
        </span>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Aucun dossier AGEFICE déposé en {year}.
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {sessions.map((s) => (
            <li key={s.participantId} className="py-2">
              <Link
                href={`/app/sessions/${s.sessionId}`}
                className="flex items-center gap-3 hover:text-primary transition-colors"
              >
                <span className="font-mono text-xs text-muted-foreground">{s.sessionCode}</span>
                <span className="flex-1 min-w-0 truncate">{s.sessionName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(s.startDate).toLocaleDateString('fr-FR')}
                </span>
                <span className="font-medium tabular-nums">{fmtEUR.format(s.amountHT)}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
