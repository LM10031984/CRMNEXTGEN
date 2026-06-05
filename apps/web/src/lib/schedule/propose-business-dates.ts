/**
 * Helpers planning session — propose dates ouvrées + créneaux.
 *
 * Règles métier Start Academy (figées, cf mémoire feedback_emargement_regles_metier) :
 *   - 8h de formation = 1 journée ouvrée
 *   - Skip samedi, dimanche, jours fériés FR (via isBusinessDayISO)
 *   - Horaires standard : matin 9h00–13h00, après-midi 14h00–18h00
 *   - Continuité naturelle : lun-ven puis lun-ven semaine suivante
 *
 * Utilisé par le Wizard étape 2 (sélection dates + créneaux + formateur).
 */

import { isBusinessDayISO } from '@/lib/business-days';

export const HORAIRE_MATIN_START = '9h00' as const;
export const HORAIRE_MATIN_END = '13h00' as const;
export const HORAIRE_APREM_START = '14h00' as const;
export const HORAIRE_APREM_END = '18h00' as const;
export const HEURES_PAR_JOUR_DEFAUT = 8;

export interface SessionSlotProposal {
  date: Date;
  startTime: string;
  endTime: string;
  halfDay: 'morning' | 'afternoon' | 'full';
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Renvoie les N premières dates ouvrées (skip sam/dim/fériés FR) à partir
 * de startDate (inclus si ouvrée, sinon la suivante). Garantit qu'on a
 * exactement N dates valides — boucle bornée pour éviter divergence.
 */
export function proposeBusinessDates(startDate: Date, nbDays: number): Date[] {
  if (nbDays <= 0) return [];
  const dates: Date[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const safetyMax = nbDays * 4 + 30; // génère au max ~4× les jours demandés (couvre weekends + fériés)
  let i = 0;
  while (dates.length < nbDays && i < safetyMax) {
    if (isBusinessDayISO(toIsoLocal(cursor))) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }
  return dates;
}

/**
 * Calcule le nombre de jours de formation à partir de la durée totale en heures.
 * Règle : 8h = 1 jour. Arrondi au supérieur pour ne pas tronquer une demi-journée
 * de fin de formation (ex: 36h → 5 jours dont le dernier en demi-journée).
 */
export function computeNbDays(durationHours: number, hoursPerDay = HEURES_PAR_JOUR_DEFAUT): number {
  if (!Number.isFinite(durationHours) || durationHours <= 0) return 0;
  return Math.ceil(durationHours / hoursPerDay);
}

/**
 * Génère les SessionSlot par défaut pour une liste de dates :
 *   - Journée 8h : 2 slots (matin 9h-13h + après-midi 14h-18h)
 *   - Si dernière journée < 8h (ex: 4h résiduelles), génère 1 slot matin seulement
 *
 * @param dates Liste des dates ouvrées (proposeBusinessDates output)
 * @param durationHours Durée totale formation (pour ajuster la dernière journée)
 */
export function generateDefaultSlots(
  dates: Date[],
  durationHours: number,
  hoursPerDay = HEURES_PAR_JOUR_DEFAUT,
): SessionSlotProposal[] {
  if (dates.length === 0) return [];
  const slots: SessionSlotProposal[] = [];
  let remainingHours = durationHours;

  for (const date of dates) {
    if (remainingHours <= 0) break;

    // Journée complète possible ?
    if (remainingHours >= hoursPerDay) {
      slots.push(
        { date: new Date(date), startTime: HORAIRE_MATIN_START, endTime: HORAIRE_MATIN_END, halfDay: 'morning' },
        { date: new Date(date), startTime: HORAIRE_APREM_START, endTime: HORAIRE_APREM_END, halfDay: 'afternoon' },
      );
      remainingHours -= hoursPerDay;
    } else if (remainingHours >= hoursPerDay / 2) {
      // Demi-journée matin
      slots.push({
        date: new Date(date),
        startTime: HORAIRE_MATIN_START,
        endTime: HORAIRE_MATIN_END,
        halfDay: 'morning',
      });
      remainingHours -= hoursPerDay / 2;
    } else {
      // Résidu < 4h, on met quand même un slot matin réduit (formateur ajuste)
      slots.push({
        date: new Date(date),
        startTime: HORAIRE_MATIN_START,
        endTime: HORAIRE_MATIN_END,
        halfDay: 'morning',
      });
      remainingHours = 0;
    }
  }

  return slots;
}

/**
 * Combine proposeBusinessDates + generateDefaultSlots pour un wizard.
 * Retourne aussi `endDate` (date du dernier slot) pour persist TrainingSession.endDate.
 */
export function proposeSchedule(input: {
  startDate: Date;
  durationHours: number;
  hoursPerDay?: number;
}): {
  dates: Date[];
  slots: SessionSlotProposal[];
  endDate: Date;
  nbDays: number;
} {
  const hoursPerDay = input.hoursPerDay ?? HEURES_PAR_JOUR_DEFAUT;
  const nbDays = computeNbDays(input.durationHours, hoursPerDay);
  const dates = proposeBusinessDates(input.startDate, nbDays);
  const slots = generateDefaultSlots(dates, input.durationHours, hoursPerDay);
  const endDate = dates[dates.length - 1] ?? input.startDate;
  return { dates, slots, endDate, nbDays };
}
