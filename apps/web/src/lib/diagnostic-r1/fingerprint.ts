/**
 * Anti-péremption des documents (leçon E-1) — fonctions pures.
 *
 * Le problème qu'elles résolvent : un audit est généré, le commercial corrige
 * ensuite une réponse ou Laurent révise un plafond de financement, et le PDF
 * déjà remis raconte une autre histoire que l'écran. Personne ne s'en aperçoit
 * jusqu'au jour où le client le remarque, en rendez-vous.
 *
 * L'empreinte est calculée sur les données QUI SONT RENDUES, pas sur le PDF :
 * un même contenu regénéré deux fois donne deux PDF différents (horodatage),
 * mais la même empreinte. C'est ce qui permet de dire « ce document est encore
 * à jour » plutôt que « ce document a été regénéré ».
 */

import { createHash } from 'node:crypto';

import type { FundingRuleValues } from '@/lib/financement/types';

import type { AnswerLike } from './progress';

export interface FingerprintInput {
  answers: AnswerLike[];
  participants: {
    id: string;
    displayName: string;
    statut: string;
    caN1: number | null;
    objectiveCa: number | null;
    strengths: string | null;
    includedInProposal: boolean;
  }[];
  rules: FundingRuleValues;
  /** Le barème : le changer périme les scores déjà édités. */
  scoringVersion: string;
  /** Le référentiel : ajouter une question périme la restitution. */
  referentialVersion: string;
}

/**
 * Empreinte SHA-256 des données rendues.
 *
 * Tout ce qui apparaît dans le document entre dans le calcul — y compris les
 * règles de financement, dont la révision change les montants sans qu'aucune
 * réponse n'ait bougé.
 */
export function computeSourceFingerprint(input: FingerprintInput): string {
  const answers = [...input.answers]
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .map((a) => `${a.questionId}=${a.isSkipped ? 'SKIP' : JSON.stringify(a.value ?? null)}`);

  const participants = [...input.participants]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (p) =>
        `${p.id}|${p.displayName}|${p.statut}|${p.caN1 ?? ''}|${p.objectiveCa ?? ''}|${p.strengths ?? ''}|${p.includedInProposal}`,
    );

  const rules = Object.keys(input.rules)
    .sort()
    .map((k) => `${k}=${input.rules[k as keyof FundingRuleValues]}`);

  const payload = [
    `referentiel:${input.referentialVersion}`,
    `bareme:${input.scoringVersion}`,
    ...answers,
    ...participants,
    ...rules,
  ].join('\n');

  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Les trois états d'un document face aux données courantes.
 *
 * Un booléen ne suffit pas, et c'est tout l'objet de l'arbitrage du 02/09/2026 :
 * « absence d'empreinte » n'est pas « périmé ». Ce sont deux affirmations
 * différentes, et confondre l'ignorance avec le défaut fait crier au loup sur
 * des documents qui vont peut-être très bien.
 *
 *   'fresh'   — le document correspond aux données actuelles ;
 *   'stale'   — les données ont changé depuis, il ne correspond plus ;
 *   'unknown' — aucune empreinte stockée : on ne peut RIEN affirmer.
 *               Cas d'un document produit avant l'introduction du mécanisme.
 */
export type FingerprintComparison = 'unknown' | 'fresh' | 'stale';

/**
 * Compare l'empreinte stockée aux données courantes.
 *
 * Convention partagée avec le chantier audit (`compareSourceFingerprint`) :
 * l'absence d'empreinte rend 'unknown', JAMAIS 'stale'. Une version antérieure
 * de cette fonction rendait `true` (périmé) dans ce cas, avec pour argument
 * qu'une régénération inutile coûte moins qu'un document douteux. Laurent a
 * tranché l'inverse, et uniformément sur tous les types de documents : on ne
 * qualifie pas de périmé ce qu'on n'a pas les moyens de vérifier.
 */
export function compareSourceFingerprint(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
): FingerprintComparison {
  if (!storedFingerprint) return 'unknown';
  return storedFingerprint === currentFingerprint ? 'fresh' : 'stale';
}
