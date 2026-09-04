import { describe, it, expect } from 'vitest';
import { renderEmargementHtml } from '../emargement-template';
import type { ClosureContext } from '../shared-template';
import type { SessionSlotLike } from '@/lib/sessions/horaires';

/**
 * La feuille d'émargement figeait « 9h00–13h00 » / « 14h00–18h00 » en en-tête
 * de colonne — la norme maison, vraie pour une journée de 8 h et fausse
 * partout ailleurs. SES-0111 « Du surfeur au pilote — Étape 2 » (11 h sur
 * 1,5 jour, J1 11h00-13h00 / 14h30-17h30, J2 9h00-12h30 / 13h30-16h00) sortait
 * donc une feuille signée par le formateur avec de faux horaires, puis
 * transmise au financeur. Même famille de risque que le refus AGEFICE du
 * 28/08/2026 sur la raison sociale du lieu.
 *
 * Ces tests verrouillent : les créneaux font foi, et leur absence laisse le
 * rendu historique intact.
 */

const CTX_BASE: ClosureContext = {
  apprenantPrenom: 'Camille',
  apprenantNom: 'Roux',
  apprenantCivility: 'Mme',
  sessionId: 'ses-0111',
  sessionCode: 'SES-0111',
  sessionTitle: 'Du surfeur au pilote — Étape 2',
  sessionStartDate: new Date('2026-09-28T00:00:00.000Z'),
  sessionEndDate: new Date('2026-09-29T00:00:00.000Z'),
  sessionLocation: 'iad France — Agence Nice, 12 rue Masséna, 06000 Nice',
  sessionLocationCity: 'Nice',
  sessionTrainers: ['Sébastien Tedesco'],
  durationHours: 11,
};

const SLOTS_SES_0111: SessionSlotLike[] = [
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '11h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '14h30', endTime: '17h30', halfDay: 'afternoon' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '9h00', endTime: '12h30', halfDay: 'morning' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '13h30', endTime: '16h00', halfDay: 'afternoon' },
];

const SLOTS_STANDARD: SessionSlotLike[] = [
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '14h00', endTime: '18h00', halfDay: 'afternoon' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '14h00', endTime: '18h00', halfDay: 'afternoon' },
];

describe("émargement — session aux horaires hors norme (SES-0111)", () => {
  const html = renderEmargementHtml({ ...CTX_BASE, sessionSlots: SLOTS_SES_0111 });

  it('porte les horaires réels de chaque demi-journée', () => {
    expect(html).toContain('11h00 – 13h00');
    expect(html).toContain('14h30 – 17h30');
    expect(html).toContain('9h00 – 12h30');
    expect(html).toContain('13h30 – 16h00');
  });

  it("n'affiche NULLE PART les horaires de la norme maison", () => {
    // Le cœur du bug : c'est cette mention qui rendait la feuille fausse.
    expect(html).not.toContain('9h00–13h00');
    expect(html).not.toContain('14h00–18h00');
    expect(html).not.toContain('14h00 – 18h00');
  });

  it('retire l’horaire des en-têtes de colonne, qui ne peuvent en porter qu’un', () => {
    expect(html).toContain('Matin</span>');
    expect(html).toContain('Après-midi</span>');
  });

  it('liste exactement les deux jours de formation', () => {
    expect(html).toContain('28 septembre 2026');
    expect(html).toContain('29 septembre 2026');
    // Une ligne par jour : la cellule date est la seule en `width: 38mm`.
    expect(html.match(/width: 38mm/g)).toHaveLength(2);
  });
});

describe('émargement — session standard avec créneaux', () => {
  const html = renderEmargementHtml({ ...CTX_BASE, sessionSlots: SLOTS_STANDARD });

  it('garde les horaires en en-tête quand tous les jours sont identiques', () => {
    // Jours identiques → aucune raison de répéter l'horaire sur chaque ligne :
    // le rendu reste celui que Laurent connaît.
    expect(html).toContain('Matin · 9h00–13h00');
    expect(html).toContain('Après-midi · 14h00–18h00');
  });

  it('normalise le format « 09:00 » hérité des scripts ad hoc', () => {
    const mixte = SLOTS_STANDARD.map((s) => ({
      ...s,
      startTime: s.startTime.replace('9h00', '09:00').replace('14h00', '14:00'),
      endTime: s.endTime.replace('13h00', '13:00').replace('18h00', '18:00'),
    }));
    const out = renderEmargementHtml({ ...CTX_BASE, sessionSlots: mixte });
    expect(out).toContain('Matin · 9h00–13h00');
    expect(out).not.toContain('09:00');
  });
});

describe('émargement — demi-journée non planifiée', () => {
  it('barre la case au lieu de proposer une signature', () => {
    // Faire signer une demi-journée qui n'a pas eu lieu invaliderait la feuille.
    const html = renderEmargementHtml({
      ...CTX_BASE,
      sessionSlots: [
        { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '11h00', endTime: '13h00', halfDay: 'morning' },
        { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '14h30', endTime: '17h30', halfDay: 'afternoon' },
        { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '9h00', endTime: '12h30', halfDay: 'morning' },
      ],
    });
    expect(html).toContain('>—</td>');
  });
});

describe('émargement — session sans créneau (comportement historique)', () => {
  it('retombe sur la norme maison, en en-tête de colonne', () => {
    const html = renderEmargementHtml(CTX_BASE);
    expect(html).toContain('Matin · 9h00–13h00');
    expect(html).toContain('Après-midi · 14h00–18h00');
  });

  it('continue de sauter samedi et dimanche', () => {
    const html = renderEmargementHtml({
      ...CTX_BASE,
      // 2026-10-02 = vendredi, 2026-10-05 = lundi : le week-end saute.
      sessionStartDate: new Date('2026-10-02T00:00:00.000Z'),
      sessionEndDate: new Date('2026-10-05T00:00:00.000Z'),
      sessionSlots: undefined,
    });
    expect(html).not.toContain('03 octobre');
    expect(html).not.toContain('04 octobre');
  });
});
