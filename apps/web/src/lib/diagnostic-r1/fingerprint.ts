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
 * Le document est-il périmé ?
 *
 * `null` sur l'empreinte stockée = document généré avant l'introduction du
 * mécanisme. On le considère périmé : mieux vaut proposer une régénération
 * inutile qu'un document dont on ne peut rien dire.
 */
export function isDocumentStale(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
): boolean {
  if (!storedFingerprint) return true;
  return storedFingerprint !== currentFingerprint;
}
