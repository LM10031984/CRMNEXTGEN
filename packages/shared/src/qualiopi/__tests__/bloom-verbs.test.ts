import { describe, it, expect } from 'vitest';
import {
  hasMeasurableActionVerb,
  normalize,
  BLOOM_ACTION_VERBS,
  VAGUE_VERBS,
} from '../bloom-verbs';

describe('bloom-verbs : taxonomie + détection verbe d\'action mesurable', () => {
  it('Test 1 — normalize retire accents + passe en minuscules', () => {
    expect(normalize('Élaborer')).toBe('elaborer');
    expect(normalize('ÉVALUER LA CONFORMITÉ')).toBe('evaluer la conformite');
    expect(normalize('Ré-écrire')).toBe('re-ecrire');
  });

  it('Test 2 — accepte un objectif commençant par un verbe Bloom (formes accentuées)', () => {
    const r = hasMeasurableActionVerb('Identifier les indicateurs Qualiopi clés.');
    expect(r.ok).toBe(true);
    expect(r.detected).toBe('identifier');
  });

  it('Test 3 — accepte un verbe composé "mettre en oeuvre" malgré l\'accent', () => {
    const r = hasMeasurableActionVerb('Mettre en œuvre un plan d\'action commercial.');
    expect(r.ok).toBe(true);
    // Le verbe détecté doit faire partie de la liste
    expect(BLOOM_ACTION_VERBS.has(r.detected ?? '')).toBe(true);
  });

  it('Test 4 — rejette un objectif vague "Comprendre les bases" avec vagueDetected', () => {
    const r = hasMeasurableActionVerb('Comprendre les bases du droit immobilier.');
    expect(r.ok).toBe(false);
    expect(r.vagueDetected).toBe('comprendre');
  });

  it('Test 5 — rejette "Connaître / Sensibiliser / Savoir" (verbes flous Qualiopi)', () => {
    const cas = [
      'Connaître les obligations légales du mandataire.',
      'Sensibiliser les apprenants à la conformité RGPD.',
      'Savoir gérer une réclamation client.',
    ];
    cas.forEach((c) => {
      const r = hasMeasurableActionVerb(c);
      expect(r.ok).toBe(false);
      expect(VAGUE_VERBS.has(r.vagueDetected ?? '')).toBe(true);
    });
  });

  it('Test 6 — ignore les puces et la ponctuation en début de ligne', () => {
    const objectifs = `
      - Identifier les acteurs du marché
      • Analyser les leviers de prospection
      * Rédiger un mandat conforme
    `;
    const r = hasMeasurableActionVerb(objectifs);
    expect(r.ok).toBe(true);
  });

  it('Test 7 — rejette un texte vide ou whitespace pur (missing: true)', () => {
    const r = hasMeasurableActionVerb('   \n  \n');
    expect(r.ok).toBe(false);
    expect(r.missing).toBe(true);
  });

  it('Test 8 — rejette un texte SANS verbe Bloom NI verbe vague (missing: true)', () => {
    const r = hasMeasurableActionVerb('Les notions de base du contrat de mandat.');
    expect(r.ok).toBe(false);
    expect(r.missing).toBe(true);
  });

  it('Test 9 — accepte si une seule ligne sur N porte le verbe Bloom', () => {
    const objectifs = `
      - Les outils utilisés en agence
      - Rédiger un compromis de vente
      - La gestion des litiges
    `;
    const r = hasMeasurableActionVerb(objectifs);
    expect(r.ok).toBe(true);
    expect(r.detected).toBe('rediger');
  });
});
