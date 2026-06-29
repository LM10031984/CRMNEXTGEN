import type { ReactNode } from 'react';
import { Calendar, Clock, Euro, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SessionStage, SessionStatus } from '@/lib/sessions/session-stage';

/**
 * Header hiérarchisé sticky de la fiche session V2.
 *
 * Hiérarchie d'info (Laurent 2026-06-05) :
 *   H1     : nom de la formation
 *   sous-titre : date + lieu + nb apprenants
 *   méta discrète : SES-XXXX · durée · tarif
 *   statut prominent : badge couleur
 *
 * Sticky offset : top-14 (sous la TopBar h-14 existante, z-10).
 * z-index 9 → reste SOUS la TopBar et permet à un drawer (z-40+) de passer
 * par-dessus quand ouvert.
 *
 * Barre actions sticky (intégrée au header) :
 *   - actionPrimary  : CTA principal (vient de sessionStage.cta)
 *   - actionsSecondary : Modifier / Inscrire / Documents
 *   - kebab          : Dupliquer / Supprimer / autres
 *
 * Server Component pur (pas de state, slots passés depuis la page session).
 */

const STATUS_PALETTE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  DRAFT:       { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-300',   label: 'Brouillon' },
  PLANNED:     { bg: 'bg-sky-100',     text: 'text-sky-800',     border: 'border-sky-300',     label: 'Planifiée' },
  OPEN:        { bg: 'bg-sky-100',     text: 'text-sky-800',     border: 'border-sky-300',     label: 'Ouverte' },
  VALIDATED:   { bg: 'bg-indigo-100',  text: 'text-indigo-800',  border: 'border-indigo-300',  label: 'Validée' },
  IN_PROGRESS: { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-300',   label: 'En cours' },
  COMPLETED:   { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', label: 'Terminée' },
  CANCELLED:   { bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',     label: 'Annulée' },
};

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function fmtDateRange(s: Date, e: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const a = s.toLocaleDateString('fr-FR', opts);
  const b = e.toLocaleDateString('fr-FR', opts);
  return a === b ? a : `${a} → ${b}`;
}

interface Props {
  /** ReactNode pour permettre l'édition inline (commit ui-e2). String OK. */
  title: ReactNode;
  code: string;
  status: SessionStatus | string;
  startDate: Date;
  endDate: Date;
  durationHours: number | null;
  pricePerLearner: number | null;
  /** Si fourni, remplace le rendu par défaut du tarif (inline edit). */
  priceSlot?: ReactNode;
  locationLabel: string | null;
  participantsCount: number;
  /** Slot CTA primaire — vient de sessionStage.cta, rendu par la page */
  actionPrimary?: ReactNode;
  /** Slot pour les boutons secondaires (Modifier, Inscrire, Documents) */
  actionsSecondary?: ReactNode;
  /** Slot kebab ⋮ pour actions rarement utilisées */
  kebab?: ReactNode;
  /** Lien retour discret au-dessus du H1 (optionnel) */
  backLink?: ReactNode;
}

export function SessionHeaderBar({
  title,
  code,
  status,
  startDate,
  endDate,
  durationHours,
  pricePerLearner,
  priceSlot,
  locationLabel,
  participantsCount,
  actionPrimary,
  actionsSecondary,
  kebab,
  backLink,
}: Props) {
  const palette = STATUS_PALETTE[status] ?? STATUS_PALETTE.DRAFT!;
  const dateLabel = fmtDateRange(startDate, endDate);

  return (
    <header
      className="sticky top-14 z-[9] -mx-4 sm:-mx-8 px-4 sm:px-8 py-4 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-border"
      aria-label="En-tête fiche session"
    >
      {backLink && <div className="mb-2">{backLink}</div>}

      {/* Empilé : bloc titre + infos en pleine largeur, puis les actions en
          dessous. Évite l'écrasement du titre par les boutons `shrink-0`
          (bug pré-existant : titre + méta réduits à une colonne d'un mot). */}
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          {/* Bandeau statut + code */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${palette.bg} ${palette.text} ${palette.border}`}
            >
              {palette.label}
            </span>
            <Badge variant="muted" className="font-mono text-[10px]">
              {code}
            </Badge>
          </div>

          {/* H1 nom formation. Titre normal : il s'affiche en entier et passe à la
              ligne aux espaces (pas de `truncate` qui le coupait). */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
            {title}
          </h1>

          {/* Sous-titre : date · lieu · inscrits */}
          <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">{dateLabel}</span>
            </span>
            {locationLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[200px]">{locationLabel}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              · {participantsCount} apprenant{participantsCount > 1 ? 's' : ''}
            </span>
          </p>

          {/* Méta discrète : durée + tarif (édition inline si priceSlot fourni). */}
          {(durationHours || pricePerLearner !== null || priceSlot) && (
            <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-x-2 gap-y-0.5 flex-wrap">
              {durationHours && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {durationHours}h
                </span>
              )}
              {durationHours && (priceSlot || pricePerLearner !== null) ? (
                <span>·</span>
              ) : null}
              {priceSlot
                ? priceSlot
                : pricePerLearner !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Euro className="h-3 w-3" aria-hidden="true" />
                      {fmtEUR.format(pricePerLearner)} / stagiaire
                    </span>
                  )}
            </p>
          )}
        </div>

        {/* Barre actions — en dessous du titre, pleine largeur, wrap si besoin. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {actionsSecondary}
          {actionPrimary}
          {kebab}
        </div>
      </div>
    </header>
  );
}
