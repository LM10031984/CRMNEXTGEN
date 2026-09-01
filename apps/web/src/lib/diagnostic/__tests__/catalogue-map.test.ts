/**
 * Le mapping décide quelle journée du catalogue part chez le prospect. Une
 * erreur ici n'est pas visible : l'email est bien formé, il propose juste la
 * mauvaise formation.
 */

import { describe, it, expect } from 'vitest';
import {
  JOURNEES,
  HORS_DIAGNOSTIC,
  choisirJournee,
  niveauDepuisReponses,
  REPLI,
} from '../catalogue-map';
import { PROBLEMATIQUES, QUESTIONS, type ProblematiqueKey } from '../questions';

const CLES = Object.keys(PROBLEMATIQUES) as ProblematiqueKey[];

describe('mapping catalogue', () => {
  it('couvre les 4 problématiques (une case vide reste déclarée)', () => {
    for (const cle of CLES) expect(JOURNEES[cle]).toBeDefined();
  });

  it('ne propose jamais une formation déclarée hors diagnostic', () => {
    const proposees = new Set(Object.values(JOURNEES).flat().map((j) => j.code));
    for (const code of Object.keys(HORS_DIAGNOSTIC)) {
      expect(proposees.has(code), `${code} est à la fois proposé et exclu`).toBe(false);
    }
  });

  it('déduit le niveau IA des vraies valeurs de la question 5', () => {
    const q5 = QUESTIONS.find((q) => q.id === 'usage_ia');
    const valeurs = q5!.choix.map((c) => c.value);
    expect(valeurs).toEqual(['JAMAIS', 'ESSAI', 'PONCTUEL', 'REGULIER']);
    expect(niveauDepuisReponses({ usage_ia: 'JAMAIS' })).toBe('DEBUTANT');
    expect(niveauDepuisReponses({ usage_ia: 'ESSAI' })).toBe('INITIE');
    expect(niveauDepuisReponses({ usage_ia: 'PONCTUEL' })).toBe('INITIE');
    expect(niveauDepuisReponses({ usage_ia: 'REGULIER' })).toBe('AVANCE');
    expect(niveauDepuisReponses({}), 'valeur absente → fondamentaux').toBe('DEBUTANT');
  });

  it('rend toujours une journée, quelle que soit la problématique', () => {
    for (const cle of CLES) {
      const sel = choisirJournee(cle, { usage_ia: 'JAMAIS' });
      expect(sel, `${cle} ne rend aucune journée`).not.toBeNull();
    }
  });

  it('bascule sur l’axe de repli quand la problématique n’a aucune journée courte', () => {
    // MANAGEMENT_EQUIPE est un trou de catalogue assumé.
    const sel = choisirJournee('MANAGEMENT_EQUIPE', { usage_ia: 'JAMAIS' });
    expect(sel!.replie).toBe(true);
    expect(sel!.axeRetenu).toBe(REPLI);
  });

  it('propose une journée différente selon le niveau IA du prospect', () => {
    const debutant = choisirJournee('IA_PRODUCTIVITE', { usage_ia: 'JAMAIS' });
    const avance = choisirJournee('IA_PRODUCTIVITE', { usage_ia: 'REGULIER' });
    expect(debutant!.code).not.toBe(avance!.code);
  });

  it('ne replie pas quand la problématique a bien une journée', () => {
    const sel = choisirJournee('PROSPECTION_MANDATS', { usage_ia: 'REGULIER' });
    expect(sel!.replie).toBe(false);
    expect(sel!.axeRetenu).toBe('PROSPECTION_MANDATS');
  });
});
