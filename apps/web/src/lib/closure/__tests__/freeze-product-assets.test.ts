import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * quick 260618-rkj — Test de PUISSANCE du figeage produit (freezeProductAssets).
 *
 * Invariant métier (Qualiopi) : deux sessions du MÊME produit reçoivent un
 * PROGRAMME et un CORPS de déroulé IDENTIQUES, et le LLM n'est appelé qu'UNE
 * fois par produit (zéro re-coût).
 *
 * Le LLM est MOCKÉ pour renvoyer un contenu DIFFÉRENT à chaque appel (compteur
 * incrémental) → simule la non-détermination réelle d'Ollama/Claude. Le pipeline
 * figé doit malgré tout renvoyer le MÊME corps pour 2 figeages du même produit.
 *
 * Test de puissance / mutation (vire ROUGE si on casse le figeage) :
 *   - retirer la mémoïsation (memo.get/set) OU re-normaliser par session
 *     → 2 appels LLM → corps DIFFÉRENTS → Test 1 ROUGE.
 *   - re-normaliser malgré derouleJson présent → appel LLM ≠ 0 → Test 2 ROUGE.
 * Le Test 4 démontre explicitement que SANS figeage le corps varie.
 *
 * Déterministe, sans réseau (Ollama/Claude entièrement mockés). Tourne en CI.
 */

// Compteurs partagés : prouvent la non-détermination du LLM mocké.
let progCalls = 0;
let derCalls = 0;

const productUpdate = vi.fn(async (..._a: unknown[]) => ({}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingProduct: {
      update: (...a: unknown[]) => productUpdate(...a),
    },
  },
}));

vi.mock('../ollama-generators', () => ({
  // Contenu DIFFÉRENT à chaque appel (compteur) → non-déterminisme simulé.
  generateNormalizedProgramme: vi.fn(async () => `programme normalisé #${++progCalls}`),
  generateDerouleContent: vi.fn(async () => ({
    jours: [{ theme: `Jour ${++derCalls}`, sequences: [] }],
    rapportFormateur: { adaptations: 'a', remarquesGroupe: 'r', bilan: 'b' },
  })),
}));

import { freezeProductAssets } from '../freeze-product-assets';
import {
  generateNormalizedProgramme,
  generateDerouleContent,
} from '../ollama-generators';

const baseProduct = {
  id: 'prod-1',
  programMd: '## programme brut',
  objectives: ['Objectif A', 'Objectif B'],
  durationHours: 8,
  title: 'Formation X',
  derouleJson: null as unknown,
};

beforeEach(() => {
  progCalls = 0;
  derCalls = 0;
  productUpdate.mockClear();
  vi.mocked(generateNormalizedProgramme).mockClear();
  vi.mocked(generateDerouleContent).mockClear();
});

describe('freezeProductAssets — invariant figeage produit', () => {
  it('Test 1 — 2 figeages du même produit = corps programme + déroulé IDENTIQUES, LLM 1x/1x', async () => {
    // Test de puissance : retirer memo.get/set OU passer 2 Map → 2 appels LLM
    //   → corps différents (#1 vs #2) → cet assert vire ROUGE.
    const memo = new Map();
    const a = await freezeProductAssets('tnt', { ...baseProduct }, memo);
    const b = await freezeProductAssets('tnt', { ...baseProduct }, memo);

    // Corps programme identique entre les 2 figeages.
    expect(a.programmeMd).toBe(b.programmeMd);
    // Corps déroulé identique (jours[]).
    expect(JSON.stringify(a.derouleBody)).toBe(JSON.stringify(b.derouleBody));

    // LLM appelé EXACTEMENT 1x chacun (mémoïsation par productId).
    expect(generateNormalizedProgramme).toHaveBeenCalledTimes(1);
    expect(generateDerouleContent).toHaveBeenCalledTimes(1);

    // Le figé est persisté sur le produit (programMd + derouleJson) une seule fois.
    expect(productUpdate).toHaveBeenCalledTimes(1);
  });

  it('Test 2 — produit déjà figé en base (derouleJson présent) → 0 re-LLM, réutilise le figé', async () => {
    // Test de puissance : re-normaliser malgré derouleJson présent → LLM ≠ 0 → ROUGE.
    const product2 = {
      ...baseProduct,
      id: 'prod-2',
      programMd: 'programme déjà figé',
      derouleJson: { jours: [{ theme: 'figé', sequences: [] }] },
    };
    const c = await freezeProductAssets('tnt', product2, new Map());

    expect(generateNormalizedProgramme).toHaveBeenCalledTimes(0);
    expect(generateDerouleContent).toHaveBeenCalledTimes(0);
    expect(productUpdate).toHaveBeenCalledTimes(0);
    expect(c.derouleBody.jours[0]?.theme).toBe('figé');
    expect(c.programmeMd).toBe('programme déjà figé');
  });

  it('Test 3 — le corps figé NE contient PAS de bilan (rapportFormateur retiré, par session)', async () => {
    // Prouve que stripRapport retire le bilan : il est généré PAR SESSION, jamais
    //   figé au produit. (Le mock generateDerouleContent renvoie pourtant un
    //   rapportFormateur — il doit être éliminé du figé.)
    const a = await freezeProductAssets('tnt', { ...baseProduct }, new Map());
    expect(a.derouleBody.rapportFormateur).toBeUndefined();
  });

  it('Test 4 — référence négative : SANS figeage, generateDerouleContent varie (theme #N)', async () => {
    // Démontre que le LLM mocké est bien non déterministe → le test de puissance
    //   garde réellement quelque chose. Sans le figeage (appel direct par session),
    //   le corps DIFFÈRE entre 2 sessions.
    const r1 = await generateDerouleContent({ titre: 't', programmeMd: 'p', nombreHeures: 8 });
    const r2 = await generateDerouleContent({ titre: 't', programmeMd: 'p', nombreHeures: 8 });
    expect(r1?.jours[0]?.theme).not.toBe(r2?.jours[0]?.theme);
    expect(r1?.jours[0]?.theme).toBe('Jour 1');
    expect(r2?.jours[0]?.theme).toBe('Jour 2');
  });
});
