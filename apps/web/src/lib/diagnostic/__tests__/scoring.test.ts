import { describe, it, expect } from 'vitest';

/**
 * Diagnostic express (stand 25 ans du MLS) — matrice PURE, aucun mock.
 *
 * Ce qui est vérifié ici, dans l'ordre d'importance métier :
 *  1. les quatre profils typiques du salon tombent sur la bonne journée ;
 *  2. le garde-fou « travaille seul ⇒ jamais de management » tient, même
 *     quand le prospect a explicitement coché « faire progresser mon équipe » ;
 *  3. un formulaire incomplet ou saboté ne fait jamais planter la restitution.
 */

import { diagnostiquer, resumerPourLead, type Reponses } from '../scoring';
import { QUESTIONS, PROBLEMATIQUES } from '../questions';

describe('diagnostiquer — profils typiques du salon', () => {
  it('conseiller noyé sous la rédaction → journée IA & productivité', () => {
    const reponses: Reponses = {
      role: 'CONSEILLER',
      equipe: 'DE_2_A_5',
      temps_perdu: 'REDACTION',
      mandats: 'STABLE',
      usage_ia: 'JAMAIS',
      origine_affaires: 'RECOMMANDATION',
      priorite: 'TEMPS',
      formation_annee: 'NON',
    };
    expect(diagnostiquer(reponses).dominante).toBe('IA_PRODUCTIVITE');
  });

  it('agent commercial dont les mandats baissent → journée prospection', () => {
    const reponses: Reponses = {
      role: 'AGENT_CO',
      equipe: 'SEUL',
      temps_perdu: 'PROSPECTION',
      mandats: 'BAISSE',
      usage_ia: 'PONCTUEL',
      origine_affaires: 'TERRAIN',
      priorite: 'MANDATS',
      formation_annee: 'NON',
    };
    expect(diagnostiquer(reponses).dominante).toBe('PROSPECTION_MANDATS');
  });

  it("directeur d'une agence de 6 à 15 personnes → journée management", () => {
    const reponses: Reponses = {
      role: 'DIRIGEANT',
      equipe: 'DE_6_A_15',
      temps_perdu: 'PILOTAGE',
      mandats: 'NON_SUIVI',
      usage_ia: 'PONCTUEL',
      origine_affaires: 'PARTAGE',
      priorite: 'EQUIPE',
      formation_annee: 'OUI',
    };
    expect(diagnostiquer(reponses).dominante).toBe('MANAGEMENT_EQUIPE');
  });

  it('agent qui vit des portails et veut être visible → journée notoriété', () => {
    const reponses: Reponses = {
      role: 'AGENT_CO',
      equipe: 'DE_2_A_5',
      temps_perdu: 'SUIVI',
      mandats: 'STABLE',
      usage_ia: 'REGULIER',
      origine_affaires: 'DIGITAL',
      priorite: 'VISIBILITE',
      formation_annee: 'NON',
    };
    expect(diagnostiquer(reponses).dominante).toBe('NOTORIETE_DIGITALE');
  });
});

describe('garde-fou « travaille seul »', () => {
  it("n'oriente jamais vers le management, même si le prospect coche « mon équipe »", () => {
    const reponses: Reponses = {
      role: 'DIRIGEANT',
      equipe: 'SEUL',
      temps_perdu: 'PILOTAGE',
      mandats: 'NON_SUIVI',
      usage_ia: 'JAMAIS',
      origine_affaires: 'TERRAIN',
      priorite: 'EQUIPE',
      formation_annee: 'NON',
    };
    const r = diagnostiquer(reponses);
    expect(r.dominante).not.toBe('MANAGEMENT_EQUIPE');
    expect(r.secondaire).not.toBe('MANAGEMENT_EQUIPE');
    expect(r.scores.MANAGEMENT_EQUIPE).toBe(0);
    expect(r.justification).toContain('Travaille seul → management d’équipe écarté');
  });

  it('laisse le management passer dès que le prospect a une équipe', () => {
    const base: Reponses = {
      role: 'DIRIGEANT',
      equipe: 'DE_6_A_15',
      temps_perdu: 'PILOTAGE',
      mandats: 'NON_SUIVI',
      usage_ia: 'JAMAIS',
      origine_affaires: 'TERRAIN',
      priorite: 'EQUIPE',
      formation_annee: 'NON',
    };
    expect(diagnostiquer(base).scores.MANAGEMENT_EQUIPE).toBeGreaterThan(0);
  });
});

describe('robustesse — on ne laisse jamais un prospect sur une erreur', () => {
  it('formulaire vide → une problématique est quand même rendue', () => {
    const r = diagnostiquer({});
    expect(PROBLEMATIQUES[r.dominante]).toBeDefined();
    expect(r.justification).toHaveLength(0);
  });

  it('valeurs inconnues ou questions sautées → ignorées, pas de crash', () => {
    const r = diagnostiquer({ role: 'PIRATE', priorite: 'MANDATS', temps_perdu: '' });
    expect(r.dominante).toBe('PROSPECTION_MANDATS');
  });

  it('la dominante et la secondaire sont toujours distinctes', () => {
    const r = diagnostiquer({ role: 'CONSEILLER', priorite: 'TEMPS' });
    expect(r.secondaire).not.toBe(r.dominante);
  });
});

describe('resumerPourLead', () => {
  it('liste les 8 questions, y compris celles non répondues', () => {
    const reponses: Reponses = { role: 'CONSEILLER', priorite: 'TEMPS' };
    const resume = resumerPourLead(diagnostiquer(reponses), reponses);
    expect(resume).toContain('Diagnostic :');
    expect(resume).toContain('(non répondu)');
    for (const q of QUESTIONS) expect(resume).toContain(q.label);
  });
});

describe('cohérence du contenu', () => {
  it('8 questions, toutes avec des choix et des identifiants uniques', () => {
    expect(QUESTIONS).toHaveLength(8);
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTIONS) {
      expect(q.choix.length).toBeGreaterThanOrEqual(3);
      const valeurs = q.choix.map((c) => c.value);
      expect(new Set(valeurs).size).toBe(valeurs.length);
    }
  });

  it('chaque problématique est atteignable par au moins une réponse', () => {
    for (const cle of Object.keys(PROBLEMATIQUES)) {
      const atteignable = QUESTIONS.some((q) =>
        q.choix.some((c) => (c.poids as Record<string, number>)[cle] > 0),
      );
      expect(atteignable, `${cle} n'est atteignable par aucune réponse`).toBe(true);
    }
  });
});
