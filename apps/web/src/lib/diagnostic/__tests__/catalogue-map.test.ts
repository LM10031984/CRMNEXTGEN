/**
 * Le mapping décide quelle journée part chez le prospect. Une erreur ici n'est
 * pas visible : l'email est bien formé, il propose juste la mauvaise formation.
 *
 * Depuis le 02/09/2026, chaque axe a SA journée Faros en tête de liste. Les
 * tests portent donc sur deux choses distinctes : le bon produit en premier, et
 * un repli qui reste atteignable si ce produit disparaît.
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

/** La journée Faros attendue en tête de chaque axe (seed-journees-faros.ts). */
const JOURNEE_FAROS: Record<ProblematiqueKey, string> = {
  PROSPECTION_MANDATS: 'FRM-0004',
  IA_PRODUCTIVITE: 'FRM-0005',
  NOTORIETE_DIGITALE: 'FRM-0006',
  MANAGEMENT_EQUIPE: 'FRM-0007',
};

describe('mapping catalogue', () => {
  it('donne à chacun des 4 axes au moins une journée', () => {
    for (const cle of CLES) {
      expect(JOURNEES[cle], `${cle} n'est pas déclaré`).toBeDefined();
      expect(JOURNEES[cle]!.length, `${cle} n'a aucune journée`).toBeGreaterThan(0);
    }
  });

  it('met la journée Faros de l’axe en PREMIER choix', () => {
    for (const cle of CLES) {
      expect(JOURNEES[cle]![0]!.code, `${cle} ne pointe pas sur sa journée Faros`).toBe(
        JOURNEE_FAROS[cle],
      );
    }
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
      expect(sel!.codes.length).toBeGreaterThan(0);
    }
  });

  it('ne replie plus JAMAIS d’axe : management a désormais sa journée', () => {
    // C'était le « trou de catalogue » d'avant les journées Faros : le prospect
    // qui déclarait un enjeu d'équipe recevait une journée de productivité.
    const sel = choisirJournee('MANAGEMENT_EQUIPE', { usage_ia: 'JAMAIS' });
    expect(sel!.replie).toBe(false);
    expect(sel!.axeRetenu).toBe('MANAGEMENT_EQUIPE');
    expect(sel!.codes[0]).toBe('FRM-0007');
    expect(sel!.axeRetenu).not.toBe(REPLI);
  });

  it('le niveau IA ne change PLUS le produit retenu, seulement la trace', () => {
    for (const cle of CLES) {
      const debutant = choisirJournee(cle, { usage_ia: 'JAMAIS' });
      const avance = choisirJournee(cle, { usage_ia: 'REGULIER' });
      expect(debutant!.codes, `${cle} : le produit dépend encore du niveau`).toEqual(avance!.codes);
      expect(debutant!.niveau).toBe('DEBUTANT');
      expect(avance!.niveau).toBe('AVANCE');
    }
  });

  it('garde des replis atteignables derrière chaque journée Faros', () => {
    // Ils ne servent que si la journée Faros a été désactivée. Sans eux, un
    // produit désactivé un soir de salon = un prospect qui ne reçoit rien.
    expect(JOURNEES.PROSPECTION_MANDATS.length).toBeGreaterThan(1);
    expect(JOURNEES.IA_PRODUCTIVITE.length).toBeGreaterThan(1);
    expect(JOURNEES.NOTORIETE_DIGITALE.length).toBeGreaterThan(1);
  });

  it('ne répète jamais deux fois le même code dans un axe', () => {
    for (const cle of CLES) {
      const codes = JOURNEES[cle]!.map((j) => j.code);
      expect(new Set(codes).size, `${cle} contient un doublon`).toBe(codes.length);
    }
  });
});
