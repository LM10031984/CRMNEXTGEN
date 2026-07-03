import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 16 (migration Ollama → Claude API) — Test de ROUTAGE des générateurs
 * closure : chaque générateur doit passer le `tier` CONFORME à D-01a à `callLlm`
 * quand AI_PROVIDER=openrouter, et la chaîne retry (MAX_ATTEMPTS) puis null (→ stub
 * côté worker) doit rester intacte en cas d'échec API répété. AUCUN fallback Ollama.
 *
 * D-01a (source de vérité 16-CONTEXT) :
 *   - quality (Sonnet) : déroulé pédagogique, RAPPORT FORMATEUR.
 *   - fast (Haiku)     : QCM, analyse besoin, grille, positionnement, satisfaction,
 *                        grille observation session.
 *
 * ── HERMÉTIQUE (obligatoire) ──
 *  vitest NE charge PAS .env → on force AI_PROVIDER=openrouter + CLOSURE_OLLAMA_RETRIES
 *  AVANT l'import du module (via vi.hoisted), et on mocke `@/lib/llm-client` (callLlm)
 *  DIRECTEMENT. On mocke aussi `@qualiof/db` (AIGenerationJob) et `@/lib/ai-ollama`
 *  pour qu'aucun IO/réseau ne parte au boot. On passe tenantId=null aux générateurs
 *  → aucune écriture Prisma requise sur le chemin nominal (mais le mock create/update
 *  est fourni par sécurité).
 *
 * ── PROTOCOLE DE MUTATION (feedback_test_de_puissance_mutation) — jamais commité ──
 *  Prouvé le 2026-07-03 :
 *   (a) Dans ollama-generators.ts, inverser le tier de generateRapportFormateur
 *       ('quality' → 'fast') → Test 1 vire ROUGE (tier attendu 'quality'). Restaurer.
 *   (b) Inverser le tier de generateAnalyseBesoinContent ('fast' → 'quality')
 *       → Test 2 vire ROUGE (tier attendu 'fast'). Restaurer.
 *   (c) Dans runOllamaJson, forcer MAX_ATTEMPTS=1 (boucle single-attempt, retrait
 *       du retry) → Test 3 `toHaveBeenCalledTimes(2)` vire ROUGE. Restaurer.
 *  → prouve que les tests gardent réellement le routage + le retry (pas un mock
 *  complaisant). Mutations documentées ici, JAMAIS appliquées au code livré.
 */

const { AI_PROVIDER, RETRIES, callLlmMock } = vi.hoisted(() => ({
  AI_PROVIDER: 'openrouter',
  RETRIES: '2',
  callLlmMock: vi.fn(),
}));
process.env.AI_PROVIDER = AI_PROVIDER;
process.env.CLOSURE_OLLAMA_RETRIES = RETRIES;

vi.mock('@qualiof/db', () => ({
  prisma: {
    aIGenerationJob: {
      create: vi.fn().mockResolvedValue({ id: 'job-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
// callLlm est la SEULE voie attendue (openrouter). On mocke aussi callOllama :
// s'il était appelé, ce serait un bug de routage (pas de fallback Ollama, D-03b).
vi.mock('@/lib/ai-ollama', () => ({ callOllama: vi.fn() }));
vi.mock('@/lib/llm-client', () => ({
  callLlm: callLlmMock,
  resolveModel: vi.fn(() => 'anthropic/claude-x'),
}));

import {
  generateRapportFormateur,
  generateAnalyseBesoinContent,
  generateQcmContent,
} from '../ollama-generators';

const FORMATION = { titre: 'Prospection immobilière', programmeMd: '# Programme\n- Module A\n- Module B', nombreHeures: 8 };
const STAGIAIRE = {
  prenom: 'Alex',
  nom: 'Martin',
  entreprise: 'Agence Sud',
  fonction: 'Conseiller',
  anciennete: '3 ans',
  diplomes: 'BTS',
  professionalStatus: 'Auto-entrepreneur',
  civilite: 'M',
};

// parsedJson Zod-valide minimal par schéma cible.
const RAPPORT_JSON = {
  adaptations: 'J’ai adapté le rythme au groupe pendant la session.',
  remarquesGroupe: 'Groupe impliqué et curieux tout au long de la journée.',
  bilan: 'Objectifs pédagogiques atteints, bonne dynamique collective.',
};
const ANALYSE_JSON = {
  contexte_professionnel: 'Le stagiaire exerce dans la vente immobilière depuis trois ans.',
  objectifs_stagiaire: ['Structurer sa prospection', 'Gagner en autonomie'],
  attentes: ['Des outils opérationnels', 'Des cas concrets'],
  competences_visees: ['Prospecter efficacement', 'Suivre ses contacts'],
  freins_identifies: [],
  motivation: 'Renforcer ses compétences pour gagner en performance au quotidien.',
};

function okResult(parsedJson: unknown) {
  return { raw: JSON.stringify(parsedJson), parsedJson, model: 'anthropic/claude-x', provider: 'openrouter', durationMs: 1 };
}

describe('générateurs closure — routage tier via callLlm (D-01a)', () => {
  beforeEach(() => {
    callLlmMock.mockReset();
  });

  it('Test 1 — generateRapportFormateur route en tier quality (Sonnet)', async () => {
    callLlmMock.mockResolvedValue(okResult(RAPPORT_JSON));
    const res = await generateRapportFormateur(FORMATION, 'PedagogicalAsset', null, null);
    expect(res).not.toBeNull();
    expect(callLlmMock).toHaveBeenCalledWith(expect.objectContaining({ tier: 'quality' }));
  });

  it('Test 2 — generateAnalyseBesoinContent route en tier fast (Haiku)', async () => {
    callLlmMock.mockResolvedValue(okResult(ANALYSE_JSON));
    const res = await generateAnalyseBesoinContent(FORMATION, STAGIAIRE, 'PedagogicalAsset', null, null);
    expect(res).not.toBeNull();
    expect(callLlmMock).toHaveBeenCalledWith(expect.objectContaining({ tier: 'fast' }));
  });

  it('Test 3 — échec API répété : retry MAX_ATTEMPTS fois puis null (→ stub côté worker), PAS de fallback Ollama', async () => {
    // parsedJson null à chaque essai → tryOnce échoue → boucle retry → null final.
    callLlmMock.mockResolvedValue({ raw: 'nope', parsedJson: null, model: 'anthropic/claude-x', provider: 'openrouter', durationMs: 1 });
    const res = await generateQcmContent(FORMATION, 'PedagogicalAsset', null, null);
    expect(res).toBeNull();
    // MAX_ATTEMPTS = CLOSURE_OLLAMA_RETRIES = 2 (1 initial + 1 retry).
    expect(callLlmMock).toHaveBeenCalledTimes(2);
  });
});
