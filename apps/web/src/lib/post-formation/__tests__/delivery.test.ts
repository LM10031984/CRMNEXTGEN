import { describe, expect, it } from 'vitest';
import {
  fingerprintAfterTrainingDelivery,
  isAfterTrainingEndDate,
  stripAfterTrainingStorageKeys,
} from '../delivery';

describe('post-formation delivery contract', () => {
  const attachment = {
    kind: 'document' as const,
    id: 'doc-1',
    label: 'Certificat',
    filename: 'certificat.pdf',
    href: '/private/doc-1',
    sourceKey: 'tenant/private/certificat-v1.pdf',
    sourceHash: 'hash-v1',
  };

  it('binds confirmation to destination and exact source document', () => {
    const base = fingerprintAfterTrainingDelivery({
      sessionId: 'session-1', key: 'individual:p1', recipientEmail: 'a@example.test',
      subject: 'Documents', attachments: [attachment],
    });
    expect(fingerprintAfterTrainingDelivery({
      sessionId: 'session-1', key: 'individual:p1', recipientEmail: 'other@example.test',
      subject: 'Documents', attachments: [attachment],
    })).not.toBe(base);
    expect(fingerprintAfterTrainingDelivery({
      sessionId: 'session-1', key: 'individual:p1', recipientEmail: 'a@example.test',
      subject: 'Documents', attachments: [{ ...attachment, sourceKey: 'tenant/private/certificat-v2.pdf' }],
    })).not.toBe(base);
  });

  it('never exposes storage keys in the admin preview', () => {
    const safe = stripAfterTrainingStorageKeys({
      key: 'individual:p1', kind: 'individual', title: 'A', recipientName: 'A',
      recipientEmail: 'a@example.test', subject: 'S', html: '<p>x</p>', text: 'x',
      attachments: [attachment], blockers: [], fingerprint: 'f', state: 'ready', sentAt: null,
      uncertainSince: null, canRecover: false,
      changedSinceLastSend: false, previousSentAt: null,
    });
    expect(safe.attachments[0]).not.toHaveProperty('sourceKey');
    expect(safe.attachments[0]).not.toHaveProperty('sourceHash');
    expect(safe.attachments[0]?.href).toBe('/private/doc-1');
  });

  it('opens only on the next Paris calendar day, including around midnight UTC', () => {
    const end = new Date('2026-09-20T00:00:00.000Z');
    expect(isAfterTrainingEndDate(end, new Date('2026-09-20T21:59:59.000Z'))).toBe(false);
    expect(isAfterTrainingEndDate(end, new Date('2026-09-20T22:00:00.000Z'))).toBe(true);
  });
});
