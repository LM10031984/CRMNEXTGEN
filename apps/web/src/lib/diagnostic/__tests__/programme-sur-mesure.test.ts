/**
 * L'ancrage est la garde qui empêche d'envoyer à un prospect une journée que
 * Start Academy n'anime pas. Sans elle, un modèle poli invente des séquences
 * crédibles et personne ne s'en aperçoit avant l'audit.
 */

import { describe, it, expect } from 'vitest';
import { ancrerProgramme, contientTermeBanni } from '../programme-sur-mesure';

const PROGRAMME_SOURCE = `Matinée (9h - 13h00) : Introduction à l'IA et Prospection Immobilière

Introduction à l'IA et à ChatGPT (2 heures)
● Présentation de ChatGPT et des outils d'IA.
● Création et paramétrage d'un compte.
● Principes de création de prompts : bonnes pratiques et erreurs à éviter.

Prospection immobilière avec l'IA (2h00)
● Analyse d'un secteur à l'aide des données DVF.
● Automatisation de la prospection (courriers, emails, SMS).
● Génération de posts pour les réseaux sociaux avec l'IA.

Après-midi (14h - 18h) : Gestion de la relation vendeur
● Préparation d'un rendez-vous structuré avec un vendeur.
● Automatisation du suivi hebdomadaire des vendeurs.`;

function seq(titre: string, sources: string[]) {
  return {
    moment: 'MATIN' as const,
    titre,
    pourquoiVous: 'Parce que vous perdez du temps sur la rédaction.',
    points: sources.map((s) => ({ source: s, texte: `Reformulé : ${s}` })),
  };
}

const BASE = {
  accroche: 'Vous perdez vos matinées à rédiger. Cette journée règle ce point précis.',
  objectifs: ['Comprendre ChatGPT', 'Rédiger plus vite', 'Automatiser la prospection'],
};

describe('ancrerProgramme', () => {
  it('accepte un programme dont tous les points viennent du programme source', () => {
    const r = ancrerProgramme(
      {
        ...BASE,
        sequences: [
          seq('Prendre en main ChatGPT', ['Présentation de ChatGPT et des outils d’IA.']),
          seq('Prospecter', ['Analyse d’un secteur à l’aide des données DVF.']),
          seq('Suivre ses vendeurs', ['Automatisation du suivi hebdomadaire des vendeurs.']),
        ],
      },
      PROGRAMME_SOURCE,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ancrage).toBe(1);
  });

  it('tolère les différences d’accents, d’apostrophes et de ponctuation', () => {
    const r = ancrerProgramme(
      {
        ...BASE,
        sequences: [
          seq('A', ["presentation de chatgpt et des outils d'ia"]),
          seq('B', ["ANALYSE D'UN SECTEUR A L'AIDE DES DONNEES DVF"]),
          seq('C', ['Automatisation du suivi hebdomadaire des vendeurs']),
        ],
      },
      PROGRAMME_SOURCE,
    );
    expect(r.ok).toBe(true);
  });

  it('REJETTE un programme dont les séquences sont inventées', () => {
    const r = ancrerProgramme(
      {
        ...BASE,
        sequences: [
          seq('Atelier deepfake', ['Créer des visites virtuelles en réalité augmentée.']),
          seq('Blockchain', ['Tokeniser un bien immobilier sur la blockchain.']),
          seq('Trading', ['Spéculer sur les prix au mètre carré.']),
        ],
      },
      PROGRAMME_SOURCE,
    );
    expect(r.ok).toBe(false);
  });

  it('jette les points inventés mais garde ceux qui sont ancrés', () => {
    const r = ancrerProgramme(
      {
        ...BASE,
        sequences: [
          seq('A', [
            'Présentation de ChatGPT et des outils d’IA.',
            'Créer des visites en réalité augmentée.', // inventé
          ]),
          seq('B', ['Analyse d’un secteur à l’aide des données DVF.']),
          seq('C', ['Automatisation du suivi hebdomadaire des vendeurs.']),
          seq('D', ['Génération de posts pour les réseaux sociaux avec l’IA.']),
        ],
      },
      PROGRAMME_SOURCE,
    );
    // 4/5 points ancrés = 80 % ≥ seuil 70 % → accepté, mais l'inventé a sauté.
    expect(r.ok).toBe(true);
    if (r.ok) {
      const tousLesTextes = r.programme.sequences.flatMap((s) => s.points.map((p) => p.source));
      expect(tousLesTextes).not.toContain('Créer des visites en réalité augmentée.');
      expect(r.ancrage).toBeCloseTo(0.8);
    }
  });

  it('refuse un programme trop maigre même si tout est ancré', () => {
    const r = ancrerProgramme(
      {
        ...BASE,
        sequences: [seq('A', ['Présentation de ChatGPT et des outils d’IA.'])],
      },
      PROGRAMME_SOURCE,
    );
    expect(r.ok).toBe(false);
  });
});

describe('termes bannis', () => {
  it('repère la pige, interdite depuis le 11/08/2026', () => {
    expect(contientTermeBanni('Pige et prospection terrain')).toBe(true);
    expect(contientTermeBanni('la pige quotidienne')).toBe(true);
    expect(contientTermeBanni('PIGE')).toBe(true);
  });

  it('ne se déclenche pas sur des mots qui contiennent « pige »', () => {
    expect(contientTermeBanni('pigeonnier')).toBe(false);
    expect(contientTermeBanni('compigeage')).toBe(false);
  });

  it('écarte un point mentionnant la pige, même parfaitement ancré', () => {
    const source = `Prospection immobilière
● Analyse d'un secteur à l'aide des données DVF.
● Organiser sa pige quotidienne sur les annonces.
● Automatisation de la prospection (courriers, emails, SMS).
● Génération de posts pour les réseaux sociaux.`;

    const r = ancrerProgramme(
      {
        ...BASE,
        sequences: [
          seq('A', ["Analyse d'un secteur à l'aide des données DVF."]),
          // ancré mot pour mot dans la source, et pourtant refusé
          seq('B', ['Organiser sa pige quotidienne sur les annonces.']),
          seq('C', ['Automatisation de la prospection (courriers, emails, SMS).']),
          seq('D', ['Génération de posts pour les réseaux sociaux.']),
        ],
      },
      source,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const tout = JSON.stringify(r.programme);
      expect(tout.toLowerCase()).not.toContain('pige');
      expect(r.programme.sequences).toHaveLength(3);
    }
  });
});
