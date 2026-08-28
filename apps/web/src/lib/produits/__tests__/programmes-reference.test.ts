import { describe, it, expect } from 'vitest';
import {
  selectionnerProgrammesReference,
  renderProgrammesReference,
} from '../programmes-reference';

/**
 * Programmes de référence montrés à l'IA — demande de Laurent (28/08) :
 * « je veux qu'elle se base sur nos programmes déjà présents dans QualiOF car
 * ils sont conformes Qualiopi ».
 *
 * Jusqu'ici le few-shot était figé dans le code (`FEW_SHOT` de
 * `ai-fill-product.ts`, 3 DOCX de mars). Le catalogue réel, lui, grandit et
 * porte les programmes réellement audités.
 *
 * Deux exigences opposées à tenir : montrer ce qui ressemble le plus à la
 * formation visée, et ne JAMAIS montrer un brouillon non relu — l'IA
 * reproduirait un défaut que personne n'a validé.
 *
 * Test de puissance : retirer le filtre `aiDraftedAt` fait virer ROUGE
 * « écarte les brouillons IA non relus ».
 */

function prog(over: Partial<Parameters<typeof selectionnerProgrammesReference>[0][number]> = {}) {
  return {
    id: 'p1',
    code: 'PROD-0001',
    title: 'IA pour conseillers immobiliers',
    theme: 'Immobilier',
    durationHours: 21,
    programMd: '### Jour 1\n'.padEnd(400, 'contenu conforme '),
    aiDraftedAt: null,
    isActive: true,
    ...over,
  };
}

const CIBLE = { title: 'Prospecter avec l’IA', theme: 'Immobilier', durationHours: 21 };

describe('selectionnerProgrammesReference', () => {
  it('écarte les brouillons IA non relus', () => {
    const r = selectionnerProgrammesReference(
      [prog({ id: 'brouillon', aiDraftedAt: new Date('2026-08-01') })],
      CIBLE,
    );
    expect(r).toEqual([]);
  });

  it('écarte les produits archivés et les programmes vides ou squelettiques', () => {
    const r = selectionnerProgrammesReference(
      [
        prog({ id: 'inactif', isActive: false }),
        prog({ id: 'vide', programMd: '' }),
        prog({ id: 'court', programMd: '### Jour 1' }),
      ],
      CIBLE,
    );
    expect(r).toEqual([]);
  });

  it('préfère le même thème, à durée égale', () => {
    const r = selectionnerProgrammesReference(
      [
        prog({ id: 'autre-theme', code: 'PROD-0002', theme: 'Management' }),
        prog({ id: 'meme-theme', code: 'PROD-0003', theme: 'Immobilier' }),
      ],
      CIBLE,
      1,
    );
    expect(r.map((p) => p.id)).toEqual(['meme-theme']);
  });

  it('à thème égal, préfère la durée la plus proche', () => {
    const r = selectionnerProgrammesReference(
      [
        prog({ id: 'loin', code: 'PROD-0004', durationHours: 88 }),
        prog({ id: 'proche', code: 'PROD-0005', durationHours: 24 }),
      ],
      CIBLE,
      1,
    );
    expect(r.map((p) => p.id)).toEqual(['proche']);
  });

  it('respecte le plafond demandé — le contexte envoyé à l’IA se paie', () => {
    const catalogue = Array.from({ length: 6 }, (_, i) =>
      prog({ id: `p${i}`, code: `PROD-000${i}` }),
    );
    expect(selectionnerProgrammesReference(catalogue, CIBLE, 2)).toHaveLength(2);
  });

  it('n’inclut jamais le produit en cours de modification', () => {
    const r = selectionnerProgrammesReference([prog({ id: 'moi' })], {
      ...CIBLE,
      excludeProductId: 'moi',
    });
    expect(r).toEqual([]);
  });

  it('est déterministe à score égal (tri par code)', () => {
    const a = prog({ id: 'a', code: 'PROD-0009' });
    const b = prog({ id: 'b', code: 'PROD-0002' });
    expect(selectionnerProgrammesReference([a, b], CIBLE, 1).map((p) => p.code)).toEqual([
      'PROD-0002',
    ]);
    expect(selectionnerProgrammesReference([b, a], CIBLE, 1).map((p) => p.code)).toEqual([
      'PROD-0002',
    ]);
  });

  it('sans thème renseigné, retombe sur la proximité de durée', () => {
    const r = selectionnerProgrammesReference(
      [
        prog({ id: 'court', code: 'PROD-0006', theme: null, durationHours: 7 }),
        prog({ id: 'juste', code: 'PROD-0007', theme: null, durationHours: 21 }),
      ],
      { title: 'Sans thème', theme: null, durationHours: 21 },
      1,
    );
    expect(r.map((p) => p.id)).toEqual(['juste']);
  });
});

/**
 * 28/08 — « le modèle n'a pas retourné un JSON valide » : les références
 * injectées entières allongeaient le contexte ET poussaient le modèle à
 * produire une réponse aussi longue, coupée par `maxTokens`. Le style
 * s'apprend sur un extrait.
 *
 * Test de puissance : retirer la troncature fait virer ROUGE « borne la taille
 * d'un programme injecté ».
 */
describe('renderProgrammesReference', () => {
  it('borne la taille d’un programme injecté', () => {
    const long = prog({ programMd: '### Jour 1\n'.repeat(2000) });
    const rendu = renderProgrammesReference([long]);
    expect(rendu.length).toBeLessThan(4000);
    expect(rendu).toContain('extrait');
  });

  it('rappelle avec l’exemple que seule la FORME se reprend', () => {
    const rendu = renderProgrammesReference([prog()]);
    // La consigne accompagne l'exemple, elle n'est pas reléguée en tête de
    // prompt : c'est ce qui tient quand le modèle a l'exemple sous les yeux.
    expect(rendu).toMatch(/INTERDIT d['’]en reprendre le CONTENU/);
  });

  it('ne rend rien quand aucun programme n’est retenu', () => {
    expect(renderProgrammesReference([])).toBe('');
  });
});
