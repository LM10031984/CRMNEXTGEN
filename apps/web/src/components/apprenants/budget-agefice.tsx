/**
 * Compteur Budget AGEFICE — montant consommé sur l'année où le dossier a été
 * monté (financingRequestDate) vs plafond 3 000 €. Cf
 * feedback_budget_agefice_annee_dossier.
 *
 * Audit 2026-05-13 :
 * - UX-06 : sélecteur d'année (chips) qui change `?ageficeYear=NNNN`
 * - UX-04 : CTA "Déposer un dossier AGEFICE" lié au flux existant
 */

import Link from 'next/link';
import { Wallet, AlertTriangle, CheckCircle2, ChevronRight, FilePlus2 } from 'lucide-react';
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
  /** True si une fiche AGEFICE a déjà été générée pour ce participant. */
  hasFicheAgefice?: boolean;
}

export function BudgetAgefice({
  year,
  consomme,
  sessions,
  /** Liste des années où l'apprenant a au moins une participation AGEFICE.
   *  Utilisée pour rendre le sélecteur d'année (UX-06). */
  availableYears = [],
  /** Pathname de la page parent — pour construire les liens du sélecteur d'année. */
  basePath,
}: {
  year: number;
  consomme: number;
  sessions: SessionLine[];
  availableYears?: number[];
  basePath: string;
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

  // Inclut l'année courante dans les chips même si pas dans availableYears
  const currentYear = new Date().getFullYear();
  const yearsForChips = Array.from(new Set([currentYear, year, ...availableYears])).sort((a, b) => b - a);

  // Sessions sans fiche AGEFICE générée — éligibles pour CTA "Déposer un dossier"
  const sessionsWithoutFiche = sessions.filter((s) => !s.hasFicheAgefice);

  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
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

      {/* UX-06 : Sélecteur d'année (chips) */}
      {yearsForChips.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {yearsForChips.map((y) => (
            <Link
              key={y}
              href={`${basePath}?tab=activity&ageficeYear=${y}` as any}
              className={cn(
                'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                y === year
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {y}
            </Link>
          ))}
        </div>
      )}

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
                {s.hasFicheAgefice && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] text-emerald-700"
                    title="Fiche AGEFICE générée"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                  </span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* UX-04 : CTA "Déposer un dossier AGEFICE" pré-rempli */}
      {sessionsWithoutFiche.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <Link
            href={`/app/sessions/${sessionsWithoutFiche[0]!.sessionId}` as any}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-primary/40 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
            title="Aller à la session pour générer la fiche AGEFICE"
          >
            <FilePlus2 className="h-4 w-4" />
            Déposer un dossier AGEFICE
            {sessionsWithoutFiche.length > 1 && (
              <span className="text-xs text-muted-foreground">
                ({sessionsWithoutFiche.length} sessions éligibles)
              </span>
            )}
          </Link>
        </div>
      )}
    </section>
  );
}
