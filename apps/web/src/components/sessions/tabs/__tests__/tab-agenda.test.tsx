/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * Phase 15 Lot 3 (15-03) Task 1 — TDD RED.
 *
 * L'onglet « Agenda » réembarque la synchro Google Calendar livrée en Phase 14
 * (`SessionCalendarSyncToggle` → `syncSessionCalendarAction`) et affiche les
 * créneaux de la session EN LECTURE (pas d'édition — créneaux interactifs hors
 * phase).
 *
 * Aucune nouvelle logique de synchro : on teste au niveau de l'action mockée
 * (moteur idempotent Phase 14 non retouché — re-sync = 0 doublon déjà prouvé
 * par la suite calendar, 67 tests).
 *
 * Assertions (cassables au gate) :
 *  1. Cliquer « Synchroniser l'agenda » appelle `syncSessionCalendarAction`
 *     UNE fois avec `{ sessionId, notifyLearners: <bool du toggle> }`.
 *  2. Chaque créneau passé en prop `slots` est affiché en lecture (une ligne
 *     par créneau, pas de champ éditable / pas de bouton modifier).
 *  3. Garde `canEdit={false}` → pas de bouton de synchro actionnable.
 */

// --- mock de l'action Phase 14 (moteur idempotent NON retouché) --------------
const syncSessionCalendarAction = vi.fn(async (..._a: unknown[]) => ({
  ok: true as const,
  recap: { inserted: 19, updated: 0, skipped: 0, total: 19, errors: [] },
}));

vi.mock('@/server/actions/calendar-sync', () => ({
  syncSessionCalendarAction: (...a: unknown[]) => syncSessionCalendarAction(...a),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { TabAgenda } from '../tab-agenda';

const SESSION_ID = 'sess-agenda-1';

const SLOTS = [
  { id: 's1', date: '2026-07-06T00:00:00.000Z', startTime: '09:00', endTime: '13:00', halfDay: 'morning' },
  { id: 's2', date: '2026-07-06T00:00:00.000Z', startTime: '14:00', endTime: '18:00', halfDay: 'afternoon' },
  { id: 's3', date: '2026-07-07T00:00:00.000Z', startTime: '09:00', endTime: '18:00', halfDay: 'full' },
];

beforeEach(() => {
  cleanup();
  syncSessionCalendarAction.mockClear();
});

describe('TabAgenda — synchro Phase 14 + créneaux lecture', () => {
  it('cliquer « Synchroniser l\'agenda » appelle syncSessionCalendarAction { sessionId, notifyLearners }', async () => {
    render(<TabAgenda sessionId={SESSION_ID} isPastSession={false} slots={SLOTS} canEdit />);

    fireEvent.click(screen.getByRole('button', { name: /synchroniser l'agenda/i }));

    await waitFor(() => expect(syncSessionCalendarAction).toHaveBeenCalledTimes(1));
    const arg = syncSessionCalendarAction.mock.calls[0]![0] as {
      sessionId: string;
      notifyLearners: boolean;
    };
    expect(arg.sessionId).toBe(SESSION_ID);
    expect(typeof arg.notifyLearners).toBe('boolean');
    expect(arg.notifyLearners).toBe(false); // défaut du toggle (case décochée)
  });

  it('propage notifyLearners=true quand le toggle est coché (session à venir)', async () => {
    render(<TabAgenda sessionId={SESSION_ID} isPastSession={false} slots={SLOTS} canEdit />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /envoyer réellement les invitations/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /synchroniser l'agenda/i }));

    await waitFor(() => expect(syncSessionCalendarAction).toHaveBeenCalledTimes(1));
    const arg = syncSessionCalendarAction.mock.calls[0]![0] as { notifyLearners: boolean };
    expect(arg.notifyLearners).toBe(true);
  });

  it('affiche les créneaux en lecture : une ligne par créneau, avec horaires', () => {
    render(<TabAgenda sessionId={SESSION_ID} isPastSession={false} slots={SLOTS} canEdit />);

    const slotItems = screen.getAllByTestId('agenda-slot');
    expect(slotItems).toHaveLength(SLOTS.length);

    // Les horaires figés apparaissent (9h-13h / 14h-18h) — lecture seule.
    expect(screen.getAllByText(/09:00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/18:00/).length).toBeGreaterThan(0);

    // Aucun champ éditable ni bouton « Modifier » sur les créneaux (hors phase).
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /modifier le créneau/i })).toBeNull();
  });

  it('canEdit={false} : pas de bouton de synchro actionnable (garde Phase 14)', () => {
    render(<TabAgenda sessionId={SESSION_ID} isPastSession={false} slots={SLOTS} canEdit={false} />);

    expect(screen.queryByRole('button', { name: /synchroniser l'agenda/i })).toBeNull();
  });
});
