import { describe, it, expect } from 'vitest';

/**
 * Phase 14 Plan 14-04 Task 1 — builders d'événements Google purs `event-builders.ts`.
 *
 * Modules purs (aucun appel API, aucun Prisma) : on teste la FORME des requestBody
 * Google produits. Le coeur métier Phase 14 : 1 formation + 15 rappels countdown
 * (J-15 → veille) + 3 relances satisfaction froid (fin+1m / +1m15j / +2m).
 *
 * Coverage (acceptance) :
 *  (a) buildRappelEvents().length === 15
 *  (b) buildFroidEvents().length === 3
 *  (c) chaque event porte extendedProperties.private.qualiof_key
 *  (d) colorId : formation '7', rappel '6', froid '3'
 *  (e) le rappel J-1 (veille) contient « demain »
 *  (f) un rappel a des reminders popup uniquement (pas de notification e-mail)
 */

import {
  buildFormationEvent,
  buildRappelEvents,
  buildFroidEvents,
  type SessionEventCtx,
} from '../event-builders';
import { QUALIOF_KEY_PROP } from '../idempotency';

const baseCtx: SessionEventCtx = {
  code: 'SES-0097',
  name: 'Session pilote',
  productTitle: 'IA conseillers immobiliers',
  startDate: new Date('2026-07-15T00:00:00Z'),
  endDate: new Date('2026-07-23T00:00:00Z'),
  locationName: 'Century 21 Mandelieu',
  locationAddressText: '12 av. de Cannes, 06210 Mandelieu',
  programmeDriveId: '1bNZhx2mfPIjizEMo6Z3GGpP_Uj6CGIv7',
  trainerEmail: 'laurent@start-academy.fr',
  trainerName: 'M. Touati',
  learnerEmails: ['a@x.fr', 'b@x.fr'],
  dureeJours: '9',
  dureeH: '72',
  heureDebut: '9h00',
  salutationPrenoms: 'Alice, Bob',
};

describe('buildFormationEvent', () => {
  it('colorId formation = 7 + clé idempotence + journées start->end (end exclusif)', () => {
    const ev = buildFormationEvent(baseCtx);
    expect(ev.colorId).toBe('7');
    expect(ev.extendedProperties?.private?.[QUALIOF_KEY_PROP]).toBe(
      'qualiof_ses-0097_formation',
    );
    expect(ev.start?.date).toBe('2026-07-15');
    // end exclusif = endDate + 1 jour
    expect(ev.end?.date).toBe('2026-07-24');
  });

  it('porte des pièces jointes Drive (programme session + CGV + RI + Charte)', () => {
    const ev = buildFormationEvent(baseCtx);
    expect(ev.attachments?.length).toBe(4);
    const urls = (ev.attachments ?? []).map((a) => a.fileUrl ?? '');
    expect(urls.some((u) => u.includes('1bNZhx2mfPIjizEMo6Z3GGpP_Uj6CGIv7'))).toBe(true);
  });
});

describe('buildRappelEvents', () => {
  it('retourne EXACTEMENT 15 rappels (J-15 → veille)', () => {
    expect(buildRappelEvents(baseCtx)).toHaveLength(15);
  });

  it('chaque rappel : colorId 6 + clé idempotence', () => {
    for (const ev of buildRappelEvents(baseCtx)) {
      expect(ev.colorId).toBe('6');
      expect(ev.extendedProperties?.private?.[QUALIOF_KEY_PROP]).toMatch(
        /^qualiof_ses-0097_rappel_\d+$/,
      );
    }
  });

  it('le rappel de la veille (J-1) contient « demain »', () => {
    const events = buildRappelEvents(baseCtx);
    // J-1 = date = startDate - 1 jour = 2026-07-14
    const veille = events.find((e) => e.start?.date === '2026-07-14');
    expect(veille).toBeDefined();
    expect(veille?.description ?? '').toContain('demain');
  });

  it('rappels = notification POPUP uniquement (aucune méthode e-mail)', () => {
    const ev = buildRappelEvents(baseCtx)[0]!;
    expect(ev.reminders?.useDefault).toBe(false);
    const overrides = ev.reminders?.overrides ?? [];
    expect(overrides.length).toBeGreaterThan(0);
    expect(overrides.every((o) => o.method === 'popup')).toBe(true);
    expect(overrides.some((o) => o.method === 'email')).toBe(false);
  });
});

describe('buildFroidEvents', () => {
  it('retourne EXACTEMENT 3 relances froid', () => {
    expect(buildFroidEvents(baseCtx)).toHaveLength(3);
  });

  it('chaque relance : colorId 3 + clé idempotence + pièce jointe questionnaire', () => {
    const events = buildFroidEvents(baseCtx);
    for (const ev of events) {
      expect(ev.colorId).toBe('3');
      expect(ev.extendedProperties?.private?.[QUALIOF_KEY_PROP]).toMatch(
        /^qualiof_ses-0097_froid_\d+$/,
      );
    }
    // pièce jointe C7.i30 (questionnaire froid)
    expect((events[0]!.attachments ?? []).length).toBeGreaterThan(0);
  });

  it('dates froid = fin+1mois / fin+1mois15j / fin+2mois (créneau 09:00)', () => {
    const events = buildFroidEvents(baseCtx);
    // fin = 2026-07-23 → +1mois = 2026-08-23
    expect(events[0]!.start?.dateTime).toContain('2026-08-23');
    expect(events[0]!.start?.dateTime).toContain('09:00');
  });
});
