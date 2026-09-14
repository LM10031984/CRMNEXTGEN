import { describe, expect, it } from 'vitest';

import { axisFromBlock } from '../builder';
import type { ComposedBlock, ComposedModule } from '../composer';

/**
 * Deux mensonges du document client, relevés sur PROP-0001 v1 le 14/09/2026.
 *
 * Ils n'ont aucun rapport entre eux sinon qu'ils sont petits, visibles à la
 * lecture, et qu'ils coûtent la confiance : le premier rend le « pourquoi »
 * d'un axe illisible, le second annonce une pièce jointe qui n'existe pas.
 */

function evidenceAlerte(label: string) {
  return { kind: 'alerte' as const, code: 'c', label, chapter: 3, answers: [] };
}
function evidenceReponse(label: string, value: string) {
  return { kind: 'reponse' as const, questionId: 'q', label, value, rule: 'r', note: 'n', earned: 0 };
}

function bloc(evidence: ComposedModule['evidence']): ComposedBlock {
  const capsule: ComposedModule = {
    moduleId: 'm1',
    title: 'Structurer la prospection',
    durationMin: 120,
    source: { productId: 'p1', code: 'PROD-0001', title: 'Prospection' } as never,
    need: { code: 'PROSPECTION', label: 'Prospection' },
    evidence,
    matchedSignals: ['s'],
    confidence: 'forte',
    isFoundation: false,
    targetProfile: null,
  };
  return {
    index: 1,
    modules: [capsule],
    onSiteMinutes: 120,
    onSiteCapacityMinutes: 240,
    conventionedHours: 8,
    needCodes: ['PROSPECTION'],
  };
}

describe('Le « pourquoi » d’un axe — des constats, pas une bouillie', () => {
  /**
   * Ce que le PDF imprimait :
   *
   *   « …contre 20 attendus. Qui prospecte réellement : Certains seulement Le
   *     suivi vendeur n'est pas ritualisé : … »
   *
   * `constats.join(' ')` collait des fragments dont certains sont des phrases
   * (elles finissent par un point) et d'autres des couples « libellé : valeur »
   * (ils ne finissent par rien). Le lecteur ne sait plus où un constat s'arrête.
   */
  it('sépare deux constats consécutifs au lieu de les coller', () => {
    const axe = axisFromBlock(
      bloc([
        evidenceReponse('Qui prospecte réellement', 'Certains seulement'),
        evidenceAlerte('Le suivi vendeur n’est pas ritualisé.'),
      ]),
      0,
      'Semaine 1',
    );
    expect(
      axe.why,
      'deux constats se touchent sans séparateur — le document est illisible',
    ).not.toContain('Certains seulement Le suivi');
  });

  it('termine chaque constat qui n’a pas de ponctuation finale', () => {
    const axe = axisFromBlock(
      bloc([evidenceReponse('Qui prospecte réellement', 'Certains seulement')]),
      0,
      'Semaine 1',
    );
    expect(axe.why.trim().endsWith('.')).toBe(true);
  });

  it('ne double pas la ponctuation d’un constat qui en a déjà une', () => {
    const axe = axisFromBlock(
      bloc([evidenceAlerte('Le suivi vendeur n’est pas ritualisé.')]),
      0,
      'Semaine 1',
    );
    expect(axe.why).not.toContain('..');
  });

  it('garde le repli quand il n’y a aucun constat', () => {
    const axe = axisFromBlock(bloc([]), 0, 'Semaine 1');
    expect(axe.why).toBe('À justifier avant envoi.');
  });
});
