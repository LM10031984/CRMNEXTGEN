/**
 * Orchestrateur idempotent de synchro Google Calendar par session (Phase 14).
 *
 * `syncSessionCalendar` est la fonction unique réutilisée par le backfill (14-05)
 * et le hook auto (14-06). Pour chaque event construit (1 formation + 15 rappels
 * + 3 froid) elle applique le cycle insert/update/skip idempotent :
 *   1. lookup par clé déterministe (events.list privateExtendedProperty=qualiof_key)
 *   2. si trouvé → events.update (eventId existant) ; sinon → events.insert
 *   3. trace en base via upsertSyncRecord (second filet d'idempotence)
 * Un re-run ne crée donc JAMAIS de doublon.
 *
 * Règles métier :
 *   - Invités : le formateur réel est TOUJOURS invité ; les apprenants sont
 *     TOUJOURS dans les invités. Seul `sendUpdates` (notification effective) varie.
 *   - sendUpdates : session passée → 'none' (backfill/audit, pas de spam) ;
 *     session future → 'all' si notifyLearners, sinon 'none'.
 *
 * Worker-safe : ce module n'importe que googleapis (indirect via google-client),
 * @qualiof/db (indirect via sync-state) et les modules calendrier purs. Aucune
 * couche serveur, garde de rôle/session ni runtime de rendu (cf. règle worker
 * BullMQ documentée dans google-client.ts).
 */

import type { calendar_v3 } from 'googleapis';
import { sharedEnv } from '@qualiof/shared/env';
import { getCalendarClient, CALENDAR_ID } from './google-client';
import { QUALIOF_KEY_PROP, type CalendarEventType } from './idempotency';
import { upsertSyncRecord, type SyncMode, type SentUpdates } from './sync-state';
import {
  buildFormationEvent,
  buildRappelEvents,
  buildFroidEvents,
  type SessionEventCtx,
} from './event-builders';

type GEvent = calendar_v3.Schema$Event;

/** Entrée de l'orchestrateur. */
export interface SyncSessionInput {
  tenantId: string;
  sessionId: string;
  ctx: SessionEventCtx;
  /** mode de synchro (backfill historique vs création auto). */
  syncMode: SyncMode;
  /** la session est-elle passée ? (passé → jamais de notification). */
  isPastSession: boolean;
  /** toggle utilisateur : notifier les apprenants (sessions futures). */
  notifyLearners: boolean;
}

/** Récapitulatif d'une exécution. */
export interface SyncSessionRecap {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
  errors: { eventKey: string; message: string }[];
}

/** Déduit le type d'événement à partir de sa clé d'idempotence. */
function eventTypeFromKey(key: string): { type: CalendarEventType; dayIndex?: number } {
  if (key.includes('_formation')) return { type: 'formation' };
  const m = key.match(/_(rappel|froid)_(\d+)$/);
  if (m) return { type: m[1] as CalendarEventType, dayIndex: Number(m[2]) };
  return { type: 'formation' };
}

/** Récupère la clé d'idempotence portée par un event construit. */
function keyOf(event: GEvent): string {
  return event.extendedProperties?.private?.[QUALIOF_KEY_PROP] ?? '';
}

/**
 * Synchronise tous les événements d'une session dans l'agenda Google de façon
 * idempotente, en appliquant la règle d'invités/sendUpdates.
 */
export async function syncSessionCalendar(
  input: SyncSessionInput,
): Promise<SyncSessionRecap> {
  // Garde staging (D-02, Phase 21) : AUCUN événement Google Calendar créé en
  // staging. Au-delà de D-02 : le token OAuth vit dans files/secrets/
  // google-token.json, ABSENT du déploiement Vercel — sans cette garde, tout
  // sync staging échouerait bruyamment.
  if (sharedEnv.NEXT_PUBLIC_APP_ENV === 'staging') {
    console.info('[calendar] sync skipped — staging guard (D-02, Phase 21)');
    return { inserted: 0, updated: 0, skipped: 0, total: 0, errors: [] };
  }
  const { ctx, tenantId, sessionId } = input;
  const cal = getCalendarClient();

  // Liste complète : 1 formation + 15 rappels + 3 froid = 19 events.
  const events: GEvent[] = [
    buildFormationEvent(ctx),
    ...buildRappelEvents(ctx),
    ...buildFroidEvents(ctx),
  ];

  // sendUpdates global : passé = none (audit-only) ; futur = toggle apprenants.
  const sendUpdates: SentUpdates = input.isPastSession
    ? 'none'
    : input.notifyLearners
      ? 'all'
      : 'none';

  // Invités : formateur réel TOUJOURS + apprenants TOUJOURS (sendUpdates pilote
  // la notification effective, pas la présence dans la liste d'invités).
  const attendees: calendar_v3.Schema$EventAttendee[] = [
    { email: ctx.trainerEmail },
    ...ctx.learnerEmails.map((email) => ({ email })),
  ];

  const recap: SyncSessionRecap = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: events.length,
    errors: [],
  };

  for (const event of events) {
    const key = keyOf(event);
    const requestBody: GEvent = { ...event, attendees };

    try {
      const existing = await cal.events.list({
        calendarId: CALENDAR_ID,
        privateExtendedProperty: [`${QUALIOF_KEY_PROP}=${key}`],
        maxResults: 1,
      });
      const items = existing.data.items ?? [];

      let googleEventId: string | null | undefined;

      if (items.length > 0 && items[0]?.id) {
        const res = await cal.events.update({
          calendarId: CALENDAR_ID,
          eventId: items[0].id,
          sendUpdates,
          supportsAttachments: true,
          requestBody,
        });
        googleEventId = res.data.id;
        recap.updated += 1;
      } else {
        const res = await cal.events.insert({
          calendarId: CALENDAR_ID,
          sendUpdates,
          supportsAttachments: true,
          requestBody,
        });
        googleEventId = res.data.id;
        recap.inserted += 1;
      }

      if (googleEventId) {
        const { type, dayIndex } = eventTypeFromKey(key);
        await upsertSyncRecord({
          tenantId,
          sessionId,
          eventKey: key,
          googleEventId,
          eventType: type,
          dayIndex,
          syncMode: input.syncMode,
          sentUpdates: sendUpdates,
        });
      }
    } catch (err) {
      // Un échec sur un event n'arrête pas les autres (résilience backfill).
      recap.errors.push({
        eventKey: key,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return recap;
}
