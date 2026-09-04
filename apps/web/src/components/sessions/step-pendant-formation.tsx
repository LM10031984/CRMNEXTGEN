import { Sun, Moon, CalendarClock } from 'lucide-react';
import { TimelineStep, StepDocRow, type StepState } from './timeline-step';
import type { HorairesAffichage } from '@/lib/sessions/horaires';

interface Props {
  state: StepState;
  participantsCount: number;
  emargementsGenerated: number;
  /** Total demi-journées prévues d'après les SessionSlot */
  totalSlots: number;
  /** Nombre de demi-journées signées (Attendance.signedAt non null) */
  signedSlots: number;
  /**
   * Horaires réels dérivés des créneaux. `null` = session sans créneau : on
   * affiche la norme maison 9h-13h / 14h-18h, qui est alors ce que produiront
   * les feuilles d'émargement.
   */
  horaires: HorairesAffichage | null;
  startDateISO: string | null;
  endDateISO: string | null;
  /** Expansion initiale (dérivée de stagesState[3] === 'active'). */
  expanded?: boolean;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export function StepPendantFormation({
  state,
  participantsCount,
  emargementsGenerated,
  totalSlots,
  signedSlots,
  horaires,
  startDateISO,
  endDateISO,
  expanded,
}: Props) {
  const startD = startDateISO ? new Date(startDateISO) : null;
  const endD = endDateISO ? new Date(endDateISO) : null;
  const now = new Date();
  const isFuture = startD ? startD > now : true;
  const isPast = endD ? endD < now : false;
  const isLive = !isFuture && !isPast;

  const periodLabel = startD && endD
    ? isFuture
      ? `Démarre le ${fmtDate.format(startD)}`
      : isPast
        ? `Terminée le ${fmtDate.format(endD)}`
        : `En cours · prévu jusqu'au ${fmtDate.format(endD)}`
    : 'Dates à définir';

  const badge = isLive ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
      </span>
      En direct
    </span>
  ) : isPast ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
      Terminée
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-medium">
      À venir
    </span>
  );

  return (
    <TimelineStep
      number={3}
      title="Pendant la formation"
      state={state}
      expanded={expanded}
      caption={periodLabel}
      qualiopi="Ind 12"
      badge={badge}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Émargement
            </h3>
            <ul className="space-y-1.5">
              <StepDocRow
                count={emargementsGenerated}
                total={participantsCount}
                label="Feuille d'émargement par stagiaire"
                indic="Ind 12"
              />
              {totalSlots > 0 && (
                <StepDocRow
                  count={signedSlots}
                  total={totalSlots}
                  label="Demi-journées signées"
                />
              )}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
              {horaires ? (
                <>
                  Horaires repris des <strong>créneaux planifiés</strong> de la session.
                </>
              ) : (
                <>
                  Aucun créneau planifié : horaires par défaut{' '}
                  <strong>9h-13h / 14h-18h</strong>, skip samedi/dimanche/jours fériés.
                </>
              )}{' '}
              Les feuilles d'émargement sont incluses dans le Pack fin de formation.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Rythme prévu
            </h3>
            <ul className="space-y-1.5 text-sm">
              {horaires && !horaires.uniformes ? (
                // Les jours ne se ressemblent pas (ex. SES-0111, 1,5 jour) :
                // afficher une moyenne serait faux, on détaille jour par jour.
                horaires.parJour.map((j) => (
                  <li key={j.label} className="flex items-start gap-2 text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">{j.label}</span> · {j.plages}
                    </span>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Sun className="h-3.5 w-3.5" /> Matin ·{' '}
                    {(horaires?.matin ?? '9h00–13h00').replace('–', ' - ')}
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Moon className="h-3.5 w-3.5" /> Après-midi ·{' '}
                    {(horaires?.apresMidi ?? '14h00–18h00').replace('–', ' - ')}
                  </li>
                </>
              )}
              {totalSlots > 0 && (
                <li className="text-[11px] text-muted-foreground mt-1.5 italic">
                  {Math.ceil(totalSlots / 2)} jour{Math.ceil(totalSlots / 2) > 1 ? 's' : ''} ·{' '}
                  {totalSlots} créneau{totalSlots > 1 ? 'x' : ''} demi-journée
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </TimelineStep>
  );
}
