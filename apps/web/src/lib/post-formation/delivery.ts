import { createHash } from 'node:crypto';

export type AfterTrainingAttachment = {
  kind: 'invoice' | 'document';
  id: string;
  label: string;
  filename: string;
  href: string;
  /** Server-only source identity. Never serialize this field to the client. */
  sourceKey?: string;
  sourceHash?: string | null;
};

export type AfterTrainingDeliveryPreview = {
  key: string;
  kind: 'individual' | 'company';
  title: string;
  recipientName: string;
  recipientEmail: string | null;
  subject: string;
  html: string;
  text: string;
  attachments: AfterTrainingAttachment[];
  blockers: string[];
  fingerprint: string;
  state: 'ready' | 'sent' | 'uncertain';
  sentAt: string | null;
  uncertainSince: string | null;
  canRecover: boolean;
  changedSinceLastSend: boolean;
  previousSentAt: string | null;
  /** Server-only membership snapshot. Never serialize this field to the client. */
  participantIds?: string[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Binds the confirmation to the current destination and exact stored files. */
export function fingerprintAfterTrainingDelivery(input: {
  sessionId: string;
  key: string;
  recipientEmail: string | null;
  subject: string;
  attachments: AfterTrainingAttachment[];
  participantIds?: string[];
}): string {
  return createHash('sha256')
    .update(
      canonical({
        sessionId: input.sessionId,
        key: input.key,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        participantIds: [...(input.participantIds ?? [])].sort(),
        attachments: input.attachments.map((attachment) => ({
          kind: attachment.kind,
          id: attachment.id,
          sourceKey: attachment.sourceKey,
          sourceHash: attachment.sourceHash,
        })),
      }),
    )
    .digest('hex');
}

export function stripAfterTrainingStorageKeys(
  delivery: AfterTrainingDeliveryPreview,
): AfterTrainingDeliveryPreview {
  const { participantIds: _participantIds, ...publicDelivery } = delivery;
  return {
    ...publicDelivery,
    attachments: delivery.attachments.map(({ sourceKey: _key, sourceHash: _hash, ...safe }) => safe),
  };
}

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function afterTrainingRelatedEntity(
  sessionId: string,
  deliveryKey: string,
  fingerprint?: string,
): string {
  const base = `after-training:${sessionId}:${deliveryKey}`;
  return fingerprint ? `${base}:snapshot:${fingerprint}` : base;
}

function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** True from the calendar day after the training end date in Paris. */
export function isAfterTrainingEndDate(endDate: Date, now: Date): boolean {
  return parisDay(now) > parisDay(endDate);
}
