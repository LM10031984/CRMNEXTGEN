import { describe, it, expect } from 'vitest';

import {
  MOTIFS,
  balayerTextesLibres,
  textesDe,
} from '../lib/balayage-donnees-personnelles.js';

/**
 * Le garde qui doit exister AVANT le deuxième import, pas après.
 *
 * Les trois réponses du dossier réel ne contiennent aucun nom — c'est relevé et
 * arbitré. Le danger n'est pas celui-là : c'est le dossier SUIVANT, où « j'en ai
 * parlé à Sophie » descendra sans que personne ne le voie.
 */
describe('balayage des réponses en texte libre', () => {
  describe('ce qui NE déclenche PAS — du texte métier reste du texte métier', () => {
    it('deux logiciels nommés ne sont pas des personnes', () => {
      const t = balayerTextesLibres([
        { questionId: 'tools-metier', valeur: 'On utilise Hektor et Netty, mal synchronisés.' },
      ]);
      expect(t).toEqual([]);
    });

    it('un objectif de chiffre d’affaires ne se lit pas comme un téléphone', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-priorities', valeur: 'Passer de 220 000 à 300 000 € de CA.' },
      ]);
      expect(t).toEqual([]);
    });

    it('un montant à cinq chiffres n’est pas un code postal', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-difficulties', valeur: '87000 EUROS de CA sur N-1, HT.' },
      ]);
      expect(t).toEqual([]);
    });

    it('un manque de production n’est pas une donnée personnelle', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-difficulties', valeur: 'Pas assez de mandats rentrés, production trop faible.' },
      ]);
      expect(t).toEqual([]);
    });
  });

  describe('ce qui ARRÊTE tout — les quatre genres nommés par Laurent', () => {
    it('un prénom usuel glissé dans une phrase', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-priorities', valeur: "J'en ai parlé à Sophie, elle est d'accord." },
      ]);
      expect(t.map((x) => x.genre)).toContain('PRENOM');
      expect(t.some((x) => x.extrait.includes('Sophie'))).toBe(true);
    });

    it('une tournure de relation suivie d’un nom', () => {
      const t = balayerTextesLibres([
        { questionId: 'tools-metier', valeur: 'Mon associé Marc gère le secteur nord.' },
      ]);
      expect(t.length).toBeGreaterThan(0);
      expect(t.some((x) => x.extrait.includes('Marc'))).toBe(true);
    });

    it('une adresse e-mail', () => {
      const t = balayerTextesLibres([
        { questionId: 'tools-metier', valeur: 'Les leads tombent sur contact@agence-x.fr.' },
      ]);
      expect(t.map((x) => x.genre)).toContain('EMAIL');
    });

    it('un numéro de téléphone français', () => {
      const t = balayerTextesLibres([
        { questionId: 'tools-metier', valeur: 'Le standard est au 06 12 34 56 78.' },
      ]);
      expect(t.map((x) => x.genre)).toContain('TELEPHONE');
    });

    it('un numéro et un type de voie', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-priorities', valeur: 'Ouvrir une vitrine au 12 rue des Lilas.' },
      ]);
      expect(t.map((x) => x.genre)).toContain('ADRESSE');
    });

    it('un code postal suivi d’une commune', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-priorities', valeur: 'Se développer sur 30000 Nîmes.' },
      ]);
      expect(t.map((x) => x.genre)).toContain('ADRESSE');
    });

    it('une civilité suivie d’un nom', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-difficulties', valeur: 'M. Dupont ne suit pas les relances.' },
      ]);
      expect(t.map((x) => x.genre)).toContain('CIVILITE');
    });
  });

  describe('ce qu’il balaye', () => {
    it('les chaînes enfouies dans une valeur JSON, pas seulement les chaînes nues', () => {
      expect(textesDe({ a: 'un', b: ['deux', { c: 'trois' }], d: 4 })).toEqual(['un', 'deux', 'trois']);
    });

    it('une valeur JSON composite est balayée jusqu’aux feuilles', () => {
      const t = balayerTextesLibres([
        { questionId: 'mgmt-top3-priorities', valeur: { autre: "voir avec Camille" } },
      ]);
      expect(t.map((x) => x.genre)).toContain('PRENOM');
    });

    it('le questionId voyage avec la trouvaille — l’arbitrage se fait réponse par réponse', () => {
      const t = balayerTextesLibres([
        { questionId: 'tools-metier', valeur: 'contact@agence-x.fr' },
      ]);
      expect(t[0]?.questionId).toBe('tools-metier');
    });
  });

  describe('§4 quater — un relevé dit ce qu’il a CHERCHÉ', () => {
    it('chaque motif porte un libellé en clair, affichable dans le rapport', () => {
      expect(MOTIFS.length).toBeGreaterThan(0);
      for (const m of MOTIFS) {
        expect(m.libelle.trim().length).toBeGreaterThan(0);
        expect(m.genre).toBeTruthy();
      }
    });

    it('les six genres nommés par la règle sont tous couverts par au moins un motif', () => {
      const genres = new Set(MOTIFS.map((m) => m.genre));
      for (const g of ['EMAIL', 'TELEPHONE', 'ADRESSE', 'CIVILITE', 'PRENOM', 'RELATION']) {
        expect(genres.has(g as never)).toBe(true);
      }
    });
  });
});
