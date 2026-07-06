import { describe, it, expect, vi } from 'vitest';

/**
 * Quick 260706-bya — Garde-fou de PROGRESSION du questionnaire de positionnement
 * (partie 3 « auto-évaluation »).
 *
 * Contexte : les 3 stagiaires de SES-0094 sortaient TOUS 1→4 sur les 2 premières
 * compétences (motif tampon uniforme = « fait faux » pour un auditeur, risque
 * indicateur 2, même problème connu que les satisfactions uniformes). La variabilité
 * vient du PROMPT (v11) et est VERROUILLÉE par PositionnementSchema.superRefine :
 *   - apres > avant sur CHAQUE compétence (progression = preuve Qualiopi de l'acquis)
 *   - avant ≤ 3 (jamais 4 : le stagiaire vient se former)
 *   - anti-tampon LÉGER : rejet du seul motif totalement plat (tous les avant
 *     identiques ET tous les deltas identiques). Toute vraie variation passe.
 *
 * Test HERMÉTIQUE pur : aucun appel LLM, aucune écriture DB. On importe SEULEMENT
 * PositionnementSchema et on l'exerce via safeParse. Les deps runtime lourdes du
 * module (prisma, ai-ollama, llm-client) sont mockées pour qu'aucun IO ne parte au
 * boot de l'import.
 *
 * ── PROTOCOLE DE MUTATION (feedback_test_de_puissance_mutation) — jamais commité ──
 *  Dans ollama-generators.ts, inverser `apres <= avant` → `apres < avant` dans le
 *  superRefine → Test 2 vire ROUGE (une stagnation 2→2 n'est plus rejetée). Restaurer.
 */

vi.mock('@qualiof/db', () => ({ prisma: {} }));
vi.mock('@/lib/ai-ollama', () => ({ callOllama: vi.fn() }));
vi.mock('@/lib/llm-client', () => ({ callLlm: vi.fn() }));

import { PositionnementSchema } from '../ollama-generators';

type Comp = { label: string; avant: 1 | 2 | 3 | 4; apres: 1 | 2 | 3 | 4 };

/** Remplit les champs texte obligatoires + injecte le tableau de compétences. */
function base(competences: Comp[]) {
  return {
    objectifs_formation: 'Monter en compétence sur les thèmes du programme de formation.',
    prerequis: 'Aucun prérequis particulier au-delà de la pratique du métier.',
    competences,
    commentaires: 'Objectifs personnels alignés sur le programme.',
  };
}

const comp = (label: string, avant: Comp['avant'], apres: Comp['apres']): Comp => ({
  label: `${label} — compétence`,
  avant,
  apres,
});

describe('PositionnementSchema — garde-fou de progression (quick 260706-bya)', () => {
  it('Test 1 — accepte une progression variée (avants variés, deltas mixtes)', () => {
    const res = PositionnementSchema.safeParse(
      base([
        comp('A', 1, 3),
        comp('B', 2, 4),
        comp('C', 3, 4),
        comp('D', 1, 2),
        comp('E', 2, 3),
        comp('F', 1, 4),
      ]),
    );
    expect(res.success).toBe(true);
  });

  it('Test 2 — rejette une stagnation (apres === avant) et une régression (apres < avant)', () => {
    const stagnation = PositionnementSchema.safeParse(
      base([
        comp('A', 1, 3),
        comp('B', 2, 2), // stagnation
        comp('C', 3, 4),
        comp('D', 1, 2),
        comp('E', 2, 3),
        comp('F', 1, 4),
      ]),
    );
    expect(stagnation.success).toBe(false);
    if (!stagnation.success) {
      expect(stagnation.error.issues.some((i) => i.path.join('.') === 'competences.1.apres')).toBe(true);
    }

    const regression = PositionnementSchema.safeParse(
      base([
        comp('A', 1, 3),
        comp('B', 3, 2), // régression
        comp('C', 3, 4),
        comp('D', 1, 2),
        comp('E', 2, 3),
        comp('F', 1, 4),
      ]),
    );
    expect(regression.success).toBe(false);
    if (!regression.success) {
      expect(regression.error.issues.some((i) => i.path.join('.') === 'competences.1.apres')).toBe(true);
    }
  });

  it('Test 3 — rejette un niveau AVANT = 4 (le stagiaire vient se former)', () => {
    const res = PositionnementSchema.safeParse(
      base([
        comp('A', 1, 3),
        comp('B', 2, 4),
        comp('C', 4, 4), // avant = 4 interdit (et apres === avant)
        comp('D', 1, 2),
        comp('E', 2, 3),
        comp('F', 1, 4),
      ]),
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'competences.2.avant')).toBe(true);
    }
  });

  it('Test 4 — rejette le motif tampon uniforme (tous 1→4, avants + deltas identiques)', () => {
    const res = PositionnementSchema.safeParse(
      base([
        comp('A', 1, 4),
        comp('B', 1, 4),
        comp('C', 1, 4),
        comp('D', 1, 4),
        comp('E', 1, 4),
        comp('F', 1, 4),
      ]),
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'competences')).toBe(true);
    }
  });

  it('Test 5 — accepte des deltas identiques SI les avants varient (garde légère)', () => {
    // deltas tous = +1 mais avants variés → ce n'est PAS un motif plat → passe.
    const res = PositionnementSchema.safeParse(
      base([
        comp('A', 1, 2),
        comp('B', 2, 3),
        comp('C', 3, 4),
        comp('D', 1, 2),
        comp('E', 2, 3),
        comp('F', 1, 2),
      ]),
    );
    expect(res.success).toBe(true);
  });
});
