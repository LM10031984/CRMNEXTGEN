/**
 * État de synchro Google Calendar par session (Phase 14).
 *
 * Wrappers Prisma tenant-scopés autour du model `SessionCalendarSync`. Ce module
 * est le second filet d'idempotence (en complément de la clé déterministe écrite
 * côté Google) et la trace d'audit Qualiopi du backfill.
 *
 * Contrainte d'isolement : ce module est appelé par les scripts/worker des Plans
 * 14-04/14-05. Il n'importe donc QUE le client Prisma partagé (comme le worker de
 * closure) — pas de couche d'authentification ni de primitive de rendu. À garder
 * sans dépendance d'auth/UI pour rester exécutable hors contexte de requête.
 */

import { prisma } from '@qualiof/db';
import type { CalendarEventType } from './idempotency';

/** Mode de synchro : reprise historique (audit) vs création à la volée. */
export type SyncMode = 'backfill' | 'auto';

/** Valeur de sendUpdates appliquée à l'insert Google (invités notifiés ou non). */
export type SentUpdates = 'all' | 'none';

export interface SyncRecordInput {
  tenantId: string;
  sessionId: string;
  /** buildEventKey(...) déterministe — Plan 14-01. */
  eventKey: string;
  /** id retourné par events.insert. */
  googleEventId: string;
  eventType: CalendarEventType;
  /** index du rappel quotidien / relance froid (optionnel pour la formation). */
  dayIndex?: number;
  syncMode: SyncMode;
  sentUpdates: SentUpdates;
}

/**
 * Crée la ligne de synchro si (sessionId, eventKey) est absent, sinon met à jour
 * googleEventId/sentUpdates/eventType/dayIndex/syncMode (updatedAt auto). La clé
 * composite `@@unique([sessionId, eventKey])` garantit l'absence de doublon : un
 * appel répété avec la même clé met à jour la même ligne au lieu d'en créer une
 * seconde.
 */
export async function upsertSyncRecord(rec: SyncRecordInput): Promise<void> {
  await prisma.sessionCalendarSync.upsert({
    where: {
      sessionId_eventKey: { sessionId: rec.sessionId, eventKey: rec.eventKey },
    },
    create: {
      tenantId: rec.tenantId,
      sessionId: rec.sessionId,
      eventKey: rec.eventKey,
      googleEventId: rec.googleEventId,
      eventType: rec.eventType,
      dayIndex: rec.dayIndex,
      syncMode: rec.syncMode,
      sentUpdates: rec.sentUpdates,
    },
    update: {
      googleEventId: rec.googleEventId,
      eventType: rec.eventType,
      dayIndex: rec.dayIndex,
      syncMode: rec.syncMode,
      sentUpdates: rec.sentUpdates,
    },
  });
}

/**
 * Renvoie toutes les lignes de synchro d'une session, scopées au tenant.
 * Le filtre tenantId est OBLIGATOIRE (defense-in-depth multi-tenant, convention
 * repo : toute requête Prisma scope par tenantId).
 */
export function getSyncRecordsForSession(tenantId: string, sessionId: string) {
  return prisma.sessionCalendarSync.findMany({
    where: { tenantId, sessionId },
  });
}
