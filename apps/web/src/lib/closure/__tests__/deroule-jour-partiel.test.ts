import { describe, it, expect, vi } from 'vitest';

/**
 * Quick 260618-vg2 — Test de PUISSANCE du min de séquences ADAPTATIF par jour
 * (buildDerouleJourSchema) pour débloquer le DERNIER jour PARTIEL d'une formation
 * dont durationHours n'est pas multiple de 8 (ex. PROD-0670 = 105h → 14 jours,
 * jour 14 = 1h ne peut pas produire ≥5 séquences → DerouleSchema global rejette
 * → déroulé GLOBAL null → freezeProductAssets throw "Corps déroulé null").
 *
 * Le plancher de séquences doit être PROPORTIONNÉ à la durée du jour :
 *   minSeq = Math.max(2, Math.min(5, Math.round(heuresJour)))
 *   jour 8h → 5 (inchangé) · jour 1h/2h → 2 · jour 5h → 5 (plafonné).
 *
 * 100% DÉTERMINISTE, sans LLM/réseau/Prisma : on valide le schéma retourné
 * DIRECTEMENT contre des fixtures de "jour" ({ theme, sequences[] }). Tourne en CI.
 *
 * ── PROTOCOLE DE MUTATION (feedback_test_de_puissance_mutation) ──
 *  Si on remet `sequences.min(5)` RIGIDE pour TOUS les jours dans
 *  buildDerouleJourSchema (au lieu du min adaptatif), les Test 1 / 2 doivent
 *  virer ROUGE → preuve que le test garde réellement le comportement adaptatif
 *  (et non un mock complaisant). Vérifié 2026-06-18 : mutation `minSeq = 5` →
 *  Test 1 + Test 2 ROUGES, le reste vert. (Test 6 cible assembleDeroule pur,
 *  indépendant du schéma — il prouve l'assemblage 14 jours, pas le plancher.)
 *  Inversement, si on met `sequences.min(0)` (plancher supprimé), les Test 3 / 5
 *  doivent virer ROUGE → preuve que la rigueur sur les jours pleins n'est PAS
 *  relâchée. Mutation documentée ici, JAMAIS appliquée au code livré.
 */

// Mocks minimaux : ollama-generators importe @qualiof/db / ai-ollama / llm-client
// au chargement du module. On ne teste QUE des fonctions PURES
// (buildDerouleJourSchema, assembleDeroule) → on neutralise ces dépendances
// pour éviter tout IO/env au boot. Aucun appel LLM réel.
vi.mock('@qualiof/db', () => ({ prisma: {} }));
vi.mock('@/lib/ai-ollama', () => ({ callOllama: vi.fn() }));
vi.mock('@/lib/llm-client', () => ({ callLlm: vi.fn() }));

import { buildDerouleJourSchema, assembleDeroule } from '../ollama-generators';

// ── Fixtures pures ───────────────────────────────────────────────────────────
// Une séquence VALIDE : chaque champ ≥ plancher DerouleSequenceSchema
// (objectifs ≥15, contenu ≥20, outils ≥6, exercice ≥15, evaluation ≥8, duree ≥3).
function makeSeq() {
  return {
    duree: '45 min',
    objectifs: 'Identifier les notions clés du module',
    contenu: 'Présentation structurée des concepts fondamentaux du jour',
    outils: 'Slides + paperboard',
    exercice: 'Mise en situation guidée en binôme',
    evaluation: 'Quiz oral formatif',
  };
}

// Un "jour" valide à n séquences : { theme(≥10), sequences: n × makeSeq() }.
function makeJour(n: number) {
  return {
    theme: 'Thème pédagogique du jour',
    sequences: Array.from({ length: n }, () => makeSeq()),
  };
}

// buildDerouleJourSchema valide la forme `{ jours: [...] }` (IDENTIQUE à DerouleSchema,
// contrat de runOllamaJson : le LLM renvoie 1 jour dans "jours"). On parse donc le
// jour ENVELOPPÉ. makeDerouleContent sert aussi de partiel pour l'assemblage (Test 6).
function makeDerouleContent(n: number) {
  return { jours: [makeJour(n)] };
}

describe('buildDerouleJourSchema — min de séquences adaptatif à la durée du jour', () => {
  it('Test 1 — jour partiel 1h passe avec 2 séquences (LE BUG À DÉBLOQUER)', () => {
    expect(buildDerouleJourSchema(1).safeParse(makeDerouleContent(2)).success).toBe(true);
  });

  it('Test 2 — jour partiel 2h passe avec 2 séquences', () => {
    expect(buildDerouleJourSchema(2).safeParse(makeDerouleContent(2)).success).toBe(true);
  });

  it('Test 3 — jour PLEIN 8h REJETTE 4 séquences (le min adaptatif ne relâche PAS tout)', () => {
    expect(buildDerouleJourSchema(8).safeParse(makeDerouleContent(4)).success).toBe(false);
  });

  it('Test 4 — jour PLEIN 8h accepte 5 séquences (non-régression)', () => {
    expect(buildDerouleJourSchema(8).safeParse(makeDerouleContent(5)).success).toBe(true);
  });

  it('Test 5 — plancher >= 2 même pour un jour très court (1 séquence rejetée)', () => {
    expect(buildDerouleJourSchema(1).safeParse(makeDerouleContent(1)).success).toBe(false);
  });

  it('Test 6 — assemblage 105h : 13 jours pleins + 1 jour partiel (2 séq) → 14 jours', () => {
    const partiels = [
      ...Array.from({ length: 13 }, () => makeDerouleContent(5)),
      makeDerouleContent(2), // jour 14 = 1h, partiel
    ];
    expect(assembleDeroule(partiels).jours).toHaveLength(14);
  });
});
