'use client';

import { AlertTriangle, Info, ShieldAlert, Wallet } from 'lucide-react';
import type { FundingSynthesis } from '@/lib/financement/types';

/**
 * « Votre potentiel de financement » — affichée à la sortie du chapitre 2.
 *
 * C'est l'écran qu'on retourne vers le dirigeant. Trois exigences en découlent :
 *   • aucun montant de prise en charge au-dessus d'un plafond ;
 *   • les deux régimes visibles séparément, un seul reste à charge ;
 *   • une estimation étiquetée comme telle — jamais présentée comme acquise.
 */

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const ALERT_ICON = {
  info: Info,
  warning: AlertTriangle,
  blocking: ShieldAlert,
} as const;

const ALERT_CLASS = {
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
  blocking:
    'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
} as const;

export function FundingSynthesisPanel({
  synthesis,
  participantCount,
}: {
  synthesis: FundingSynthesis;
  participantCount: number;
}) {
  if (participantCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <Wallet className="h-6 w-6 mx-auto mb-2 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Ajoutez les personnes de l’équipe pour voir ce qui est mobilisable.
          <br />
          Sans la grille, pas de budget — et sans budget, pas de R2.
        </p>
      </div>
    );
  }

  const s = synthesis;
  const clientAlerts = s.alerts.filter((a) => a.audience === 'client');
  const internalAlerts = s.alerts.filter((a) => a.audience === 'internal');

  return (
    <section className="rounded-lg border border-border overflow-hidden">
      <header className="px-4 py-3 bg-muted/50 border-b border-border">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4" aria-hidden />
          Votre potentiel de financement
        </h2>
      </header>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Figure
            label="Volume proposé"
            value={`${s.halfDays} demi-journées`}
            hint={`${s.onsiteHours} h sur site`}
          />
          <Figure
            label="Heures conventionnées"
            value={`${s.conventionedHours} h`}
            hint="la valeur portée partout"
          />
          <Figure label="Prise en charge" value={eur.format(s.totalCoverage)} emphasis="positive" />
          <Figure
            label="Reste à charge"
            value={eur.format(s.totalRemainder)}
            emphasis={s.totalRemainder > 0 ? 'neutral' : 'positive'}
            hint={`sur ${eur.format(s.totalPrice)} HT`}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <RegimeCard
            title="AGEFICE — indépendants"
            participantCount={s.agefice.participantCount}
            budget={s.agefice.budget}
            coverage={s.agefice.coverage}
          />
          <RegimeCard
            title="OPCO EP — salariés"
            participantCount={s.opcoEp.participantCount}
            budget={s.opcoEp.manualValidationRequired ? null : s.opcoEp.budget}
            coverage={s.opcoEp.coverage}
            note={
              s.opcoEp.manualValidationRequired
                ? "Enveloppe à valider manuellement avec l'OPCO EP"
                : s.opcoEp.envelope !== null
                  ? `Enveloppe entreprise : ${eur.format(s.opcoEp.envelope)}/an`
                  : undefined
            }
          />
        </div>

        {clientAlerts.length > 0 && (
          <ul className="space-y-2">
            {clientAlerts.map((a) => {
              const Icon = ALERT_ICON[a.severity];
              return (
                <li
                  key={a.code}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed ${ALERT_CLASS[a.severity]}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                  <span>{a.label}</span>
                </li>
              );
            })}
          </ul>
        )}

        {internalAlerts.length > 0 && (
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
              {internalAlerts.length} point{internalAlerts.length > 1 ? 's' : ''} de vigilance
              interne — à ne pas montrer au client
            </summary>
            <ul className="px-3 pb-3 space-y-2">
              {internalAlerts.map((a) => (
                <li key={a.code} className="text-xs text-muted-foreground leading-relaxed">
                  • {a.label}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
          Montants indicatifs calculés sur les éléments déclarés en rendez-vous. Deux dossiers
          administratifs distincts sont montés selon les statuts. Les droits non consommés au 31
          décembre sont perdus.
        </p>
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: 'neutral' | 'positive';
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          emphasis === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : ''
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RegimeCard({
  title,
  participantCount,
  budget,
  coverage,
  note,
}: {
  title: string;
  participantCount: number;
  budget: number | null;
  coverage: number;
  note?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium mb-1">{title}</p>
      <p className="text-xs text-muted-foreground">
        {participantCount} personne{participantCount > 1 ? 's' : ''}
      </p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Droits mobilisables</dt>
          <dd className="tabular-nums font-medium">
            {budget === null ? 'à valider' : eur.format(budget)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Pris en charge</dt>
          <dd className="tabular-nums font-medium">{eur.format(coverage)}</dd>
        </div>
      </dl>
      {note && <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
