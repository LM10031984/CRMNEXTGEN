import { describe, it, expect } from 'vitest';
import {
  formatJourCourtFr,
  formatJourFr,
  horairesSession,
  jourFrISO,
  normaliserHeure,
  plageHoraire,
  resumeHorairesSession,
  type SessionSlotLike,
} from '../horaires';

/**
 * SES-0111 « Du surfeur au pilote — Étape 2 » : 11 h sur 1,5 jour, horaires
 * hors norme maison. C'est le cas qui a motivé ce module.
 */
const SES_0111: SessionSlotLike[] = [
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '11h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '14h30', endTime: '17h30', halfDay: 'afternoon' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '9h00', endTime: '12h30', halfDay: 'morning' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '13h30', endTime: '16h00', halfDay: 'afternoon' },
];

/** Session standard 8 h/jour, telle que produite par `proposeSchedule`. */
const STANDARD: SessionSlotLike[] = [
  { date: new Date('2026-11-05T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-11-05T00:00:00.000Z'), startTime: '14h00', endTime: '18h00', halfDay: 'afternoon' },
  { date: new Date('2026-11-06T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-11-06T00:00:00.000Z'), startTime: '14h00', endTime: '18h00', halfDay: 'afternoon' },
];

describe('normaliserHeure', () => {
  it('ramène les deux conventions de la base au format maison', () => {
    // « 9h00 » vient de proposeSchedule, « 09:00 » des scripts ad hoc (SES-0110).
    expect(normaliserHeure('9h00')).toBe('9h00');
    expect(normaliserHeure('09:00')).toBe('9h00');
    expect(normaliserHeure('14:30')).toBe('14h30');
    expect(normaliserHeure('9h')).toBe('9h00');
    expect(normaliserHeure(' 14h00 ')).toBe('14h00');
  });

  it("n'invente rien sur un format inconnu", () => {
    expect(normaliserHeure('en matinée')).toBe('en matinée');
  });

  it('compose une plage lisible', () => {
    expect(plageHoraire('09:00', '13:00')).toBe('9h00–13h00');
  });
});

describe('jourFrISO', () => {
  it('range minuit UTC et minuit Paris sur le même jour calendaire', () => {
    // Les deux conventions cohabitent en base : sans ancrage Europe/Paris,
    // la seconde bascule sur la veille et l'émargement perd un jour.
    expect(jourFrISO(new Date('2026-09-28T00:00:00.000Z'))).toBe('2026-09-28');
    expect(jourFrISO(new Date('2026-09-27T22:00:00.000Z'))).toBe('2026-09-28');
  });

  it('formate le jour sans dépendre du fuseau du serveur', () => {
    expect(formatJourFr('2026-09-28')).toBe('28 septembre 2026');
    expect(formatJourCourtFr('2026-09-28')).toContain('28/09');
  });
});

describe('horairesSession — session hors norme (SES-0111)', () => {
  const h = horairesSession(SES_0111)!;

  it('rend un jour par date, dans l’ordre', () => {
    expect(h.jours.map((j) => j.iso)).toEqual(['2026-09-28', '2026-09-29']);
  });

  it('porte les horaires réels de chaque demi-journée', () => {
    expect(h.jours[0]).toMatchObject({ matin: '11h00–13h00', apresMidi: '14h30–17h30' });
    expect(h.jours[1]).toMatchObject({ matin: '9h00–12h30', apresMidi: '13h30–16h00' });
  });

  it('signale que les jours diffèrent — l’horaire ne peut pas aller en en-tête', () => {
    expect(h.uniformes).toBe(false);
    expect(h.matinCommun).toBeNull();
    expect(h.apresMidiCommun).toBeNull();
  });

  it('résume la convocation jour par jour', () => {
    const resume = resumeHorairesSession(SES_0111)!;
    expect(resume).toContain('28/09 : 11h00 – 13h00 et 14h30 – 17h30');
    expect(resume).toContain('29/09 : 9h00 – 12h30 et 13h30 – 16h00');
    // Test de puissance : l'ancienne mention générique ne doit plus sortir.
    expect(resume).not.toContain('17h00 (pauses');
  });
});

describe('horairesSession — session standard', () => {
  it('détecte des jours identiques et expose l’horaire commun', () => {
    const h = horairesSession(STANDARD)!;
    expect(h.uniformes).toBe(true);
    expect(h.matinCommun).toBe('9h00–13h00');
    expect(h.apresMidiCommun).toBe('14h00–18h00');
  });

  it('résume la convocation en une seule ligne', () => {
    expect(resumeHorairesSession(STANDARD)).toBe('9h00 – 13h00 et 14h00 – 18h00');
  });

  it('normalise avant de comparer : « 09:00 » et « 9h00 » sont le même horaire', () => {
    // Dette SES-0110 : deux formats pour une même session ne doivent pas la
    // faire passer pour irrégulière et casser l'en-tête de l'émargement.
    const mixte: SessionSlotLike[] = [
      { date: new Date('2026-11-05T00:00:00.000Z'), startTime: '09:00', endTime: '13:00', halfDay: 'morning' },
      { date: new Date('2026-11-05T00:00:00.000Z'), startTime: '14:00', endTime: '18:00', halfDay: 'afternoon' },
      { date: new Date('2026-11-06T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
      { date: new Date('2026-11-06T00:00:00.000Z'), startTime: '14h00', endTime: '18h00', halfDay: 'afternoon' },
    ];
    expect(horairesSession(mixte)!.uniformes).toBe(true);
  });
});

describe('horairesSession — absence de créneaux', () => {
  it('retourne null pour laisser l’appelant sur la norme maison', () => {
    expect(horairesSession([])).toBeNull();
    expect(horairesSession(null)).toBeNull();
    expect(horairesSession(undefined)).toBeNull();
    expect(resumeHorairesSession(undefined)).toBeNull();
  });
});

describe('horairesSession — demi-journée seule et journée d’un tenant', () => {
  it('laisse l’après-midi à null quand seul le matin est planifié', () => {
    const h = horairesSession([
      { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
    ])!;
    expect(h.jours[0]).toMatchObject({ matin: '9h00–13h00', apresMidi: null });
    expect(resumeHorairesSession([
      { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
    ])).toBe('9h00 – 13h00');
  });

  it("range un créneau 'full' à part, sans le confondre avec une demi-journée", () => {
    const h = horairesSession([
      { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '9h00', endTime: '17h00', halfDay: 'full' },
    ])!;
    expect(h.jours[0]).toMatchObject({
      matin: null,
      apresMidi: null,
      journeeComplete: '9h00–17h00',
    });
  });
});
