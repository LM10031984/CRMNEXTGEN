export const SUCCESSFUL_INITIAL_SUBMISSION_STATUSES = new Set([
  'SENT',
  'ACK_RECEIVED',
  'APPROVED',
  'REIMBURSED',
]);

export type FundingTone = 'neutral' | 'warning' | 'success';

export function isSuccessfulInitialSubmission(submission: {
  stage: string;
  status: string;
  deliveryState: string;
  sentAt: Date | string | null;
}): boolean {
  return (
    submission.stage === 'PRISE_EN_CHARGE' &&
    submission.deliveryState === 'READY' &&
    submission.sentAt !== null &&
    SUCCESSFUL_INITIAL_SUBMISSION_STATUSES.has(submission.status)
  );
}

export function companyDepositState(
  members: readonly { opcoDepositedAt: Date | string | null }[],
): FundingTone {
  if (members.length === 0) return 'neutral';
  const deposited = members.filter((member) => member.opcoDepositedAt !== null).length;
  if (deposited === members.length) return 'success';
  return deposited > 0 ? 'warning' : 'neutral';
}

export function aggregateFundingTone(tones: readonly FundingTone[]): FundingTone {
  if (tones.length === 0) return 'neutral';
  if (tones.every((tone) => tone === 'success')) return 'success';
  return tones.some((tone) => tone !== 'neutral') ? 'warning' : 'neutral';
}
