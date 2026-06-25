import { describe, it, expect } from 'vitest';
import {
  isSiegeVence,
  renderRappelText,
  renderFroidText,
  HORAIRES,
  DRIVE_DOCS,
  SIEGE_BLOCK,
  SIEGE_ADDRESS,
  type CalendarTextCtx,
} from '../texts';

const baseCtx: CalendarTextCtx = {
  formation: 'Formation IA conseillers immobiliers',
  dates: '04/05/2026',
  heureDebut: '9h00',
  lieu: '495 avenue de Cannes, 06210 Mandelieu',
  dureeJours: '9',
  dureeH: '72',
  formateur: 'M. Jordan Touati',
  countdown: '',
  salutationPrenoms: 'Jordan, Kristin',
  isSiege: false,
};

describe('isSiegeVence', () => {
  it("retourne true pour l'adresse exacte du siège", () => {
    expect(isSiegeVence(SIEGE_ADDRESS)).toBe(true);
  });

  it('retourne true malgré variantes (Boulevard, casse, espaces)', () => {
    expect(isSiegeVence('  618  BOULEVARD jean   maurel inférieur, 06140 VENCE ')).toBe(true);
  });

  it('retourne false pour une adresse hors siège (Mandelieu)', () => {
    expect(isSiegeVence('495 avenue de Cannes, 06210 Mandelieu')).toBe(false);
  });

  it('retourne false pour une chaîne vide', () => {
    expect(isSiegeVence('')).toBe(false);
  });
});

describe('renderRappelText', () => {
  it('interpole formation, dates, lieu, durée et formateur', () => {
    const out = renderRappelText(baseCtx);
    expect(out).toContain('Formation IA conseillers immobiliers');
    expect(out).toContain('04/05/2026 à 9h00');
    expect(out).toContain('495 avenue de Cannes');
    expect(out).toContain('9 journées (72h)');
    expect(out).toContain('M. Jordan Touati');
    expect(out).toContain('Emma de Start Academy');
  });

  it('injecte la ligne countdown quand ctx.countdown est fourni', () => {
    const out = renderRappelText({ ...baseCtx, countdown: 'dans 15 jours' });
    expect(out).toContain('📅 Votre formation commence dans 15 jours !');
  });

  it("n'ajoute PAS de countdown pour l'événement formation (countdown vide)", () => {
    const out = renderRappelText(baseCtx);
    expect(out).not.toContain('📅 Votre formation commence');
  });

  it('ajoute le bloc siège quand isSiege=true', () => {
    const out = renderRappelText({ ...baseCtx, isSiege: true, lieu: SIEGE_ADDRESS });
    expect(out).toContain('🛣️ Accès par les transports');
    expect(out).toContain('🛏️ Hébergement : https://www.booking.com/city/fr/vence.fr.html');
  });

  it("n'ajoute PAS le bloc siège quand isSiege=false", () => {
    const out = renderRappelText(baseCtx);
    expect(out).not.toContain(SIEGE_BLOCK);
  });
});

describe('renderFroidText', () => {
  it('contient le lien du questionnaire à froid (id Drive C7.i30)', () => {
    const out = renderFroidText(baseCtx, 1);
    expect(out).toContain(DRIVE_DOCS.questionnaireFroid);
  });

  it('personnalise la salutation avec les prénoms', () => {
    const out = renderFroidText(baseCtx, 1);
    expect(out).toContain('Bonjour Jordan, Kristin,');
  });

  it('relance 1 contient la blague PS', () => {
    const out = renderFroidText(baseCtx, 1);
    expect(out).toContain('Aucun questionnaire n');
  });

  it('relance 2 porte le préfixe RELANCE 2', () => {
    const out = renderFroidText(baseCtx, 2);
    expect(out).toContain('RELANCE 2 (1 mois et 15 jours après la fin)');
  });

  it('relance 3 porte le préfixe RELANCE 3', () => {
    const out = renderFroidText(baseCtx, 3);
    expect(out).toContain('RELANCE 3 (2 mois après la fin)');
  });
});

describe('constantes figées', () => {
  it('horaires figés 9h-13h / 14h-18h', () => {
    expect(HORAIRES.matin).toBe('9h-13h');
    expect(HORAIRES.apresMidi).toBe('14h-18h');
  });

  it('les 4 ids Drive sont présents', () => {
    expect(DRIVE_DOCS.cgv).toBe('11mfi7rl8BQFhETty4vGat3GmoGclBuFx');
    expect(DRIVE_DOCS.ri).toBe('1o44Zg9dXdbyJpQ-U5Tpfbx8lZjcm-Qyf');
    expect(DRIVE_DOCS.chartePsh).toBe('1HxT_uy6UNIZBYGSl9gchT0sS9_DaidNM');
    expect(DRIVE_DOCS.questionnaireFroid).toBe('1uNEa7QemfEYKyYf5ywGIdvyshWTjhYjd');
  });
});
