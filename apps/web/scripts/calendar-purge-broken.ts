/**
 * Purge des ~350 événements .ics CASSÉS de l'agenda « Rappel Formations » (14-05).
 *
 * Contexte : un ancien import .ics a créé des centaines d'événements rappel/froid
 * SANS invités, SANS pièces jointes et SANS la clé d'idempotence QualiOF. Avant le
 * backfill propre (calendar-backfill.ts) il faut nettoyer l'agenda de ces scories.
 *
 * Critère « cassé » (volontairement CONSERVATEUR — mieux vaut sous-supprimer) :
 *   un event est cassé s'il N'A PAS la clé extendedProperties.private.qualiof_key
 *   ET n'a AUCUN invité (attendees vide/absent).
 *   → Tout event portant qualiof_key est un event QualiOF géré : JAMAIS supprimé.
 *   → Les événements manuels validés (formation + 3 froid pilote) ont des invités
 *     et/ou des pièces jointes/extendedProperties : protégés par le 2e critère.
 *
 * SÉCURITÉ :
 *   - DRY par défaut : liste seulement (compte + échantillon). Aucune suppression.
 *   - WRITE=1 requis pour supprimer réellement (events.delete sendUpdates:'none' →
 *     aucune notification envoyée aux invités lors de la purge).
 *   - Suppression SÉQUENTIELLE (for...of await), jamais en parallèle.
 *
 * ⚠️ À NE PAS exécuter sans validation humaine du DRY (checkpoint Plan 14-05) :
 *   1. cd apps/web && pnpm calendar:purge        (DRY, vérifier ~350 + échantillon)
 *   2. WRITE=1 pnpm calendar:purge               (suppression réelle)
 *   3. pnpm calendar:purge                        (re-DRY → 0 cassé restant)
 *
 * Worker/CLI-safe : n'importe que google-client (googleapis) + idempotency (pur).
 */

import type { calendar_v3 } from 'googleapis';
import { getCalendarClient, CALENDAR_ID } from '../src/lib/calendar/google-client';
import { QUALIOF_KEY_PROP } from '../src/lib/calendar/idempotency';

type GEvent = calendar_v3.Schema$Event;

const WRITE = process.env.WRITE === '1';
const DELETE_DELAY_MS = 150; // lissage anti-429 entre deux suppressions (mode WRITE)

/** Liste TOUS les événements de l'agenda (pagination via pageToken). */
async function listAllEvents(cal: calendar_v3.Calendar): Promise<GEvent[]> {
  const all: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const res = await cal.events.list({
      calendarId: CALENDAR_ID,
      maxResults: 2500,
      singleEvents: true, // déplie les séries récurrentes (les .ics sont souvent récurrents)
      showDeleted: false,
      pageToken,
    });
    all.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return all;
}

/**
 * Un event est « QualiOF géré » s'il porte la clé d'idempotence : ne jamais le
 * supprimer (filet anti-erreur n°1).
 */
function isQualiofManaged(ev: GEvent): boolean {
  return Boolean(ev.extendedProperties?.private?.[QUALIOF_KEY_PROP]);
}

/** Un event a-t-il au moins un invité ? (filet anti-erreur n°2 : protège le pilote). */
function hasAttendees(ev: GEvent): boolean {
  return (ev.attendees?.length ?? 0) > 0;
}

/** Critère « cassé » conservateur : pas de clé QualiOF ET aucun invité. */
function isBroken(ev: GEvent): boolean {
  return !isQualiofManaged(ev) && !hasAttendees(ev);
}

function summarize(ev: GEvent): string {
  const when = ev.start?.date ?? ev.start?.dateTime ?? '(sans date)';
  const creator = ev.creator?.email ?? '?';
  const att = ev.attendees?.length ?? 0;
  const hasKey = isQualiofManaged(ev) ? 'qualiof_key' : '—';
  return `${when} | ${ev.summary ?? '(sans titre)'} | invités:${att} | ${hasKey} | creator:${creator} | id:${ev.id}`;
}

async function main() {
  const cal = getCalendarClient();
  console.log(`Agenda cible : ${CALENDAR_ID}`);
  console.log(`Mode : ${WRITE ? 'WRITE (suppression réelle)' : 'DRY (lecture seule)'}\n`);

  const events = await listAllEvents(cal);
  console.log(`Total événements listés : ${events.length}`);

  const managed = events.filter(isQualiofManaged);
  const broken = events.filter(isBroken);
  const protectedManual = events.filter((e) => !isQualiofManaged(e) && hasAttendees(e));

  console.log(`  QualiOF gérés (qualiof_key, JAMAIS supprimés) : ${managed.length}`);
  console.log(`  Manuels validés (invités, protégés)            : ${protectedManual.length}`);
  console.log(`  CASSÉS (sans clé ET sans invité) → à purger     : ${broken.length}\n`);

  // Garde-fou : un event QualiOF ne doit JAMAIS être dans la liste à supprimer.
  const leak = broken.filter(isQualiofManaged);
  if (leak.length > 0) {
    console.error(`✗ ANOMALIE : ${leak.length} event(s) qualiof_key dans la liste à supprimer. ABANDON.`);
    process.exit(1);
  }

  console.log('— échantillon des 15 premiers CASSÉS —');
  for (const ev of broken.slice(0, 15)) console.log(`  ${summarize(ev)}`);
  if (broken.length > 15) console.log(`  … (+${broken.length - 15} autres)`);
  console.log('');

  if (!WRITE) {
    console.log('(DRY — aucun event supprimé. Relancer avec WRITE=1 après validation.)');
    return;
  }

  let deleted = 0;
  const failures: { id: string; message: string }[] = [];
  // Suppression SÉQUENTIELLE (jamais Promise.all — lissage quota + résilience).
  for (const ev of broken) {
    if (!ev.id) continue;
    try {
      await cal.events.delete({
        calendarId: CALENDAR_ID,
        eventId: ev.id,
        sendUpdates: 'none', // pas de notification aux invités lors de la purge
      });
      deleted += 1;
      if (deleted % 25 === 0) console.log(`  … ${deleted}/${broken.length} supprimés`);
      await new Promise((r) => setTimeout(r, DELETE_DELAY_MS));
    } catch (err) {
      failures.push({ id: ev.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`\n✓ Purge terminée : ${deleted}/${broken.length} supprimés.`);
  if (failures.length > 0) {
    console.log(`✗ ${failures.length} échec(s) (rejouer le script pour rattrapage) :`);
    for (const f of failures) console.log(`  ${f.id} : ${f.message}`);
  }
}

main().catch((err) => {
  console.error('Erreur fatale purge :', err);
  process.exit(1);
});
