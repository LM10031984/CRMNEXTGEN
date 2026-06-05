/**
 * Détection de conflits formateur sur une plage de dates.
 *
 * Croise les `SessionTrainer` existants + la table `TrainerAvailability`
 * (si renseignée) pour identifier les jours où un formateur est déjà pris
 * ou indisponible.
 *
 * Utilisé par le Wizard étape 2 : picker formateur affiche un badge
 * "Disponible / X conflits" et désactive l'option si tout est conflictuel.
 */

import { prisma } from '@qualiof/db';

export interface TrainerConflict {
  date: Date;
  reason: 'session_taken' | 'unavailable';
  sessionCode?: string;
  sessionId?: string;
}

export interface TrainerAvailabilityResult {
  trainerId: string;
  hasConflict: boolean;
  conflicts: TrainerConflict[];
  totalDates: number;
  availableDates: number;
}

/**
 * Pour un formateur donné et une liste de dates de formation prévues,
 * retourne les conflits (sessions existantes + indisponibilités).
 *
 * @param trainerPersonId Person.id du formateur (cf SessionTrainer.personId)
 * @param dates Dates de formation à vérifier
 * @param tenantId Tenant pour scope multi-tenant
 * @param excludeSessionId Si on est en édition d'une session existante,
 *                         exclure cette session des conflits (sinon faux positif)
 */
export async function checkTrainerAvailability(
  trainerPersonId: string,
  dates: Date[],
  tenantId: string,
  excludeSessionId?: string,
): Promise<TrainerAvailabilityResult> {
  if (dates.length === 0) {
    return { trainerId: trainerPersonId, hasConflict: false, conflicts: [], totalDates: 0, availableDates: 0 };
  }

  // Plage globale pour la requête
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  // Inclure la journée entière du max
  const maxDateInclusive = new Date(maxDate);
  maxDateInclusive.setDate(maxDateInclusive.getDate() + 1);

  // 1. Sessions où le formateur est déjà rattaché et qui chevauchent la plage
  const conflictingSessions = await prisma.trainingSession.findMany({
    where: {
      tenantId,
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      trainers: { some: { personId: trainerPersonId } },
      // Chevauchement : session.startDate < maxInclusive AND session.endDate >= minDate
      AND: [{ startDate: { lt: maxDateInclusive } }, { endDate: { gte: minDate } }],
    },
    select: { id: true, code: true, startDate: true, endDate: true },
  });

  // 2. TrainerAvailability status="busy" qui chevauche la plage globale.
  // Modèle Prisma : trainerId / startsAt / endsAt / status ("available"|"busy"|"tentative").
  // Note : on tolère absence de la table (V1) — try/catch silencieux.
  type BusyRange = { startsAt: Date; endsAt: Date };
  let busyRanges: BusyRange[] = [];
  try {
    const unavail = await prisma.trainerAvailability.findMany({
      where: {
        trainerId: trainerPersonId,
        status: 'busy',
        // overlap : startsAt < maxInclusive AND endsAt > minDate
        AND: [{ startsAt: { lt: maxDateInclusive } }, { endsAt: { gt: minDate } }],
      },
      select: { startsAt: true, endsAt: true },
    });
    busyRanges = unavail;
  } catch {
    // TrainerAvailability optionnel — skip silencieux
  }

  // 3. Pour chaque date demandée, check si conflit
  const conflicts: TrainerConflict[] = [];
  for (const date of dates) {
    const isoStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isoEnd = new Date(isoStart);
    isoEnd.setDate(isoEnd.getDate() + 1);

    // Session déjà prise ce jour ?
    const taken = conflictingSessions.find(
      (s) => s.startDate < isoEnd && s.endDate >= isoStart,
    );
    if (taken) {
      conflicts.push({
        date,
        reason: 'session_taken',
        sessionCode: taken.code,
        sessionId: taken.id,
      });
      continue;
    }

    // Indispo ? (au moins une plage "busy" chevauche ce jour)
    const isBusy = busyRanges.some((r) => r.startsAt < isoEnd && r.endsAt > isoStart);
    if (isBusy) {
      conflicts.push({ date, reason: 'unavailable' });
    }
  }

  return {
    trainerId: trainerPersonId,
    hasConflict: conflicts.length > 0,
    conflicts,
    totalDates: dates.length,
    availableDates: dates.length - conflicts.length,
  };
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Variante batch : check pour plusieurs formateurs d'un coup (utile pour
 * lister tous les formateurs dispos dans le picker).
 */
export async function checkMultipleTrainersAvailability(
  trainerPersonIds: string[],
  dates: Date[],
  tenantId: string,
  excludeSessionId?: string,
): Promise<TrainerAvailabilityResult[]> {
  return Promise.all(
    trainerPersonIds.map((id) =>
      checkTrainerAvailability(id, dates, tenantId, excludeSessionId),
    ),
  );
}
