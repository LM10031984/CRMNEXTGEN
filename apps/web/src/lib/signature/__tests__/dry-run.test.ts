import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot B — provider `dry-run` (spec 2026-09-04 §5 lot B).
 *
 * Même rôle que `MAIL_DRY_RUN` pour le mailer : développer et démontrer la
 * chaîne complète SANS clé DocuSeal et SANS le moindre paquet réseau. La règle
 * du lot est explicite — « sans clé, provider dry-run obligatoire, jamais
 * d'appel réseau silencieux ».
 *
 * Le provider simule aussi la complétion (`simulateCompletion`) pour que le
 * lot C puisse dérouler webhook → PDF signé → certificat en local.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { createDryRunProvider } from '@/lib/signature/dry-run';

const INPUT = {
  name: 'SES-0042 — Convention',
  externalId: 'sr-uuid-1',
  documents: [{ name: 'convention', pdf: Buffer.from('%PDF-1.7 convention') }],
  signers: [
    { role: 'Client', name: 'Marie Dupont', email: 'dirigeant@agence.fr', order: 0 },
    { role: 'Organisme de formation', name: 'Laurent MARX', email: 'laurent@start-academy.fr', order: 1 },
  ],
  expiresAt: null,
};

describe('provider dry-run', () => {
  beforeEach(() => fetchMock.mockReset());

  it('ne touche JAMAIS le réseau', async () => {
    const p = createDryRunProvider();
    await p.createRequest(INPUT);
    await p.getRequest('dry-run-1');
    await p.cancel('dry-run-1');
    await p.remind('dry-run-1', 's-0');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('s’annonce comme dry-run (aucune confusion possible dans les logs / l’AuditLog)', () => {
    expect(createDryRunProvider().name).toBe('dry-run');
  });

  it('rend un providerId reconnaissable et un lien de signature par signataire', async () => {
    const res = await createDryRunProvider().createRequest(INPUT);

    expect(res.providerId).toMatch(/^dry-run-/);
    expect(res.status).toBe('SENT');
    expect(res.signers).toHaveLength(2);
    expect(res.signers[0]!.role).toBe('Client');
    expect(res.signers[0]!.signUrl).toContain(res.providerId);
    expect(res.signers.every((s) => s.signedAt === null)).toBe(true);
  });

  it('démarre en attente, puis passe à DONE une fois la complétion simulée', async () => {
    const p = createDryRunProvider();
    const created = await p.createRequest(INPUT);

    expect((await p.getRequest(created.providerId)).status).toBe('SENT');

    p.simulateCompletion(created.providerId);

    const state = await p.getRequest(created.providerId);
    expect(state.status).toBe('DONE');
    expect(state.completedAt).toBeInstanceOf(Date);
    expect(state.signers.every((s) => s.signedAt instanceof Date)).toBe(true);
  });

  it('rend un PDF signé et un certificat de signature factices mais bien formés', async () => {
    const p = createDryRunProvider();
    const created = await p.createRequest(INPUT);
    p.simulateCompletion(created.providerId);

    const docs = await p.downloadSignedDocument(created.providerId);
    expect(docs[0]!.name).toBe('convention');
    expect(docs[0]!.pdf.subarray(0, 4).toString()).toBe('%PDF');

    const audit = await p.downloadAuditTrail(created.providerId);
    expect(audit.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('refuse de livrer un signé tant que la signature n’est pas simulée', async () => {
    const p = createDryRunProvider();
    const created = await p.createRequest(INPUT);
    await expect(p.downloadSignedDocument(created.providerId)).rejects.toThrow(/pas encore/i);
  });

  it('produit un événement webhook exploitable tel quel par le lot C', () => {
    const p = createDryRunProvider();
    const ev = p.parseEvent(
      JSON.stringify({ event_type: 'submission.completed', data: { id: 'dry-run-1' } }),
    );
    expect(ev.type).toBe('request.completed');
    expect(ev.providerId).toBe('dry-run-1');
  });

  it('accepte ses propres webhooks (pas de secret en local)', () => {
    expect(createDryRunProvider().verifyWebhook('{}', {})).toBe(true);
  });
});
