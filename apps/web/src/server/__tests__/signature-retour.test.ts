import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LE RETOUR — `traiterEvenementSignature` (lot C.3).
 *
 * CE QUE CE FICHIER GARDE, ET CE QUE ÇA COÛTERAIT DE LE PERDRE :
 *
 *  1. **L'IDEMPOTENCE, clé par clé.** Un prestataire rejoue ses webhooks. Sans
 *     mémoire, `submission.completed` rejoué re-téléchargerait le PDF et
 *     renverrait « voici votre exemplaire » une seconde fois. Et la clé doit
 *     porter le SIGNATAIRE : `form.completed` part une fois par signataire, et
 *     dédupliquer sans lui ferait disparaître la signature du second.
 *  2. **`form.completed` NE CLÔT JAMAIS.** Même sur le dernier signataire. `DONE`
 *     veut dire « la preuve est en bucket » ; la poser plus tôt rendrait la
 *     cellule verte devant un PDF à ancres, sans signature.
 *  3. **RIEN N'EST ÉCRIT SI LE TÉLÉCHARGEMENT ÉCHOUE**, et la mémoire de
 *     l'événement est EFFACÉE pour que le rejeu serve à quelque chose.
 *  4. **AUCUNE DEVINETTE** sur le signataire visé.
 */

const {
  requestFindUnique,
  requestUpdate,
  documentUpdate,
  auditLogCreate,
  webhookEventCreate,
  webhookEventDeleteMany,
  userFindMany,
  notificationCreateMany,
  participantFindUnique,
  organizationFindUnique,
  transactionMock,
  uploadFileMock,
  loadOfConfigMock,
  resoudreSignataireOfMock,
  notifierSignataireMock,
  notifierExemplaireMock,
  relacherPiecesMock,
} = vi.hoisted(() => ({
  requestFindUnique: vi.fn(),
  requestUpdate: vi.fn(),
  documentUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  webhookEventCreate: vi.fn(),
  webhookEventDeleteMany: vi.fn(),
  userFindMany: vi.fn(),
  notificationCreateMany: vi.fn(),
  participantFindUnique: vi.fn(),
  organizationFindUnique: vi.fn(),
  transactionMock: vi.fn(),
  uploadFileMock: vi.fn(),
  loadOfConfigMock: vi.fn(),
  resoudreSignataireOfMock: vi.fn(),
  notifierSignataireMock: vi.fn(),
  notifierExemplaireMock: vi.fn(),
  relacherPiecesMock: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    signatureRequest: { findUnique: requestFindUnique, update: requestUpdate },
    document: { update: documentUpdate },
    auditLog: { create: auditLogCreate },
    signatureWebhookEvent: { create: webhookEventCreate, deleteMany: webhookEventDeleteMany },
    user: { findMany: userFindMany },
    notification: { createMany: notificationCreateMany },
    sessionParticipant: { findUnique: participantFindUnique },
    organization: { findUnique: organizationFindUnique },
    $transaction: transactionMock,
  },
}));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'qualiof-docs', uploadFile: uploadFileMock }));
vi.mock('@/lib/of-config', () => ({ loadOfConfig: loadOfConfigMock }));
vi.mock('@/lib/signature/signataire-of', () => ({
  resoudreSignataireOf: resoudreSignataireOfMock,
}));
vi.mock('@/lib/signature/notifier', () => ({
  notifierSignataire: notifierSignataireMock,
  notifierExemplaireSigne: notifierExemplaireMock,
}));
vi.mock('@/server/signature-relacher', async () => {
  const DOC_TYPES = ['CONVENTION', 'AGEFICE', 'ASSIDUITE'];
  return {
    relacherPieces: relacherPiecesMock,
    estPieceSignable: (t: string) => DOC_TYPES.includes(t),
  };
});

import { traiterEvenementSignature, estRejouable } from '../signature-retour';
import type { SignatureEvent, SignatureProvider } from '@/lib/signature/port';

const TENANT = 'tenant-1';
const PROVIDER_ID = 'sub-42';
const LE_20 = new Date('2026-09-20T14:30:00.000Z');

const CLIENT = {
  role: 'Client',
  name: 'Claire DUPONT',
  email: 'claire@agence.fr',
  providerSignerId: 'sg-client',
  status: 'sent',
  signedAt: null,
  signUrl: 'https://docuseal.eu/s/CLIENT',
  declinedAt: null,
};
const OF = {
  role: 'Organisme de formation',
  name: 'Laurent Marx',
  email: 'laurent@start-academy.fr',
  providerSignerId: 'sg-of',
  status: 'sent',
  signedAt: null,
  signUrl: 'https://docuseal.eu/s/OF',
  declinedAt: null,
};

function demande(over: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    tenantId: TENANT,
    providerId: PROVIDER_ID,
    status: 'SENT',
    sessionId: 'ses-1',
    signers: [CLIENT, OF],
    expiresAt: new Date('2026-10-11T09:00:00.000Z'),
    signerRole: 'DIRIGEANT',
    session: { code: 'SES-0048', product: { title: "L'IA au service de l'agent commercial" } },
    documents: [
      {
        id: 'doc-conv',
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: 'org-1',
        sessionId: 'ses-1',
        participantId: null,
        status: 'sent_for_signature',
        signedPdfUrl: null,
      },
    ],
    ...over,
  };
}

function evenement(over: Partial<SignatureEvent> = {}): SignatureEvent {
  return {
    type: 'signer.completed',
    providerId: PROVIDER_ID,
    signerId: 'sg-client',
    signerEmail: 'claire@agence.fr',
    auditTrailUrl: null,
    occurredAt: LE_20,
    raw: {},
    ...over,
  };
}

const PDF_SIGNE = Buffer.from('%PDF-signe');
const CERTIFICAT = Buffer.from('%PDF-certificat');

function providerFactice(over: Partial<SignatureProvider> = {}): SignatureProvider {
  return {
    name: 'docuseal',
    createRequest: vi.fn(),
    getRequest: vi.fn(),
    cancel: vi.fn(),
    remind: vi.fn(),
    downloadSignedDocument: vi.fn(async () => [{ name: 'convention.pdf', pdf: PDF_SIGNE }]),
    downloadAuditTrail: vi.fn(async () => CERTIFICAT),
    verifyWebhook: vi.fn(() => true),
    parseEvent: vi.fn(),
    ...over,
  } as unknown as SignatureProvider;
}

/** Les écritures réellement passées par le `tx`. */
const tx = {
  signatureRequestUpdate: vi.fn(),
  documentUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  requestFindUnique.mockResolvedValue(demande());
  webhookEventCreate.mockResolvedValue({ id: 'evt-1' });
  webhookEventDeleteMany.mockResolvedValue({ count: 1 });
  requestUpdate.mockResolvedValue({});
  userFindMany.mockResolvedValue([{ id: 'user-admin' }]);
  notificationCreateMany.mockResolvedValue({ count: 1 });
  organizationFindUnique.mockResolvedValue({ legalName: 'AGENCE MARTIN', brandName: null });
  participantFindUnique.mockResolvedValue(null);
  uploadFileMock.mockResolvedValue({ key: 'k', bucket: 'b', size: 10 });
  loadOfConfigMock.mockResolvedValue({ name: 'Start Academy', resp: {} });
  resoudreSignataireOfMock.mockResolvedValue({
    ok: true,
    signatory: { name: 'Laurent Marx', email: 'laurent@start-academy.fr', title: '', order: 'AFTER' },
  });
  notifierSignataireMock.mockResolvedValue({ envoye: true, destinataire: '', partie: 'OF', motif: null });
  notifierExemplaireMock.mockResolvedValue([]);
  relacherPiecesMock.mockResolvedValue([]);
  transactionMock.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) =>
    fn({
      signatureRequest: { update: tx.signatureRequestUpdate },
      document: { update: tx.documentUpdate },
      auditLog: { create: tx.auditLogCreate },
    }),
  );
});

function traiter(event: SignatureEvent, typeBrut: string, provider = providerFactice()) {
  return traiterEvenementSignature({ event, typeBrut, provider });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('IDEMPOTENCE — un webhook rejoué ne refait rien', () => {
  it('la mémoire est écrite AVANT le traitement, avec le signataire dans la clé', async () => {
    await traiter(evenement(), 'form.completed');
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
    expect((webhookEventCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toEqual({
      tenantId: TENANT,
      providerId: PROVIDER_ID,
      eventType: 'form.completed',
      signerKey: 'sg-client',
    });
  });

  it('PUISSANCE — une seconde livraison (P2002) ⇒ rien n’est écrit', async () => {
    webhookEventCreate.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const r = await traiter(evenement(), 'form.completed');
    expect(r).toEqual({ traite: false, motif: 'deja-traite' });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifierSignataireMock).not.toHaveBeenCalled();
  });

  it('PUISSANCE — un événement de SUBMISSION porte une clé de signataire VIDE', async () => {
    await traiter(evenement({ type: 'request.completed', signerId: null }), 'submission.completed');
    expect(
      (webhookEventCreate.mock.calls[0]![0] as { data: { signerKey: string } }).data.signerKey,
    ).toBe('');
  });

  it('une demande inconnue ne fait rien, et ne fait pas rejouer', async () => {
    requestFindUnique.mockResolvedValue(null);
    const r = await traiter(evenement(), 'form.completed');
    expect(r).toEqual({ traite: false, motif: 'demande-inconnue' });
    expect(webhookEventCreate).not.toHaveBeenCalled();
    expect(estRejouable(r.motif)).toBe(false);
  });

  it('un événement sans identifiant de demande est refusé avant toute lecture', async () => {
    const r = await traiter(evenement({ providerId: '  ' }), 'form.completed');
    expect(r.motif).toBe('sans-identifiant');
    expect(requestFindUnique).not.toHaveBeenCalled();
  });
});

describe('form.completed — un signataire a signé', () => {
  it('pose `signedAt` sur LE BON signataire et passe la demande en PARTIALLY_SIGNED', async () => {
    const r = await traiter(evenement(), 'form.completed');
    expect(r).toEqual({ traite: true, motif: 'signature-enregistree' });

    const patch = tx.signatureRequestUpdate.mock.calls[0]![0] as {
      data: { signers: Array<Record<string, unknown>>; status: string };
    };
    expect(patch.data.status).toBe('PARTIALLY_SIGNED');
    expect(patch.data.signers[0]!.signedAt).toBe('2026-09-20T14:30:00.000Z');
    expect(patch.data.signers[1]!.signedAt).toBe(null);
  });

  it('PUISSANCE — le DERNIER `form.completed` ne passe PAS la demande en DONE', async () => {
    // `DONE` veut dire « la preuve est en bucket ». La poser ici rendrait la
    // cellule verte devant un PDF à ancres, sans signature dessus.
    requestFindUnique.mockResolvedValue(
      demande({ signers: [{ ...CLIENT, signedAt: '2026-09-19T08:00:00.000Z' }, OF] }),
    );
    await traiter(evenement({ signerId: 'sg-of', signerEmail: OF.email }), 'form.completed');
    const patch = tx.signatureRequestUpdate.mock.calls[0]![0] as { data: { status: string } };
    expect(patch.data.status).toBe('PARTIALLY_SIGNED');
    expect(documentUpdate).not.toHaveBeenCalled();
    expect(tx.documentUpdate).not.toHaveBeenCalled();
  });

  it('prévient LE SUIVANT — « à votre tour » à l’organisme', async () => {
    await traiter(evenement(), 'form.completed');
    expect(notifierSignataireMock).toHaveBeenCalledTimes(1);
    const args = notifierSignataireMock.mock.calls[0]![0] as {
      signataires: Array<{ email: string; partie: string }>;
      piece: string;
      concerne: string;
    };
    expect(args.signataires).toHaveLength(1);
    expect(args.signataires[0]!.email).toBe('laurent@start-academy.fr');
    expect(args.signataires[0]!.partie).toBe('OF');
    expect(args.piece).toBe('CONVENTION');
    expect(args.concerne).toBe('AGENCE MARTIN');
  });

  it('PUISSANCE — quand le suivant n’a AUCUN lien, aucun email ne part', async () => {
    requestFindUnique.mockResolvedValue(demande({ signers: [CLIENT, { ...OF, signUrl: null }] }));
    await traiter(evenement(), 'form.completed');
    expect(notifierSignataireMock).not.toHaveBeenCalled();
  });

  it('PUISSANCE — signataire introuvable : RIEN n’est écrit, et on le DIT', async () => {
    const r = await traiter(
      evenement({ signerId: 'sg-inconnu', signerEmail: 'ailleurs@nulle-part.fr' }),
      'form.completed',
    );
    expect(r.motif).toBe('signataire-introuvable');
    expect(transactionMock).not.toHaveBeenCalled();
    const patch = requestUpdate.mock.calls[0]![0] as { data: { lastError: string } };
    expect(patch.data.lastError).toContain('Signataire introuvable');
  });

  it('journalise `signature.signer_completed` sans utilisateur — un webhook n’en a pas', async () => {
    await traiter(evenement(), 'form.completed');
    const trace = tx.auditLogCreate.mock.calls[0]![0] as {
      data: { action: string; userId: null; diff: Record<string, unknown> };
    };
    expect(trace.data.action).toBe('signature.signer_completed');
    expect(trace.data.userId).toBe(null);
    expect(trace.data.diff).toMatchObject({ signedAt: '2026-09-20T14:30:00.000Z' });
  });
});

describe('submission.completed — la preuve revient', () => {
  const EVT = { type: 'request.completed' as const, signerId: null };

  it('télécharge le PDF ET le certificat, et les range côte à côte (§4.4)', async () => {
    await traiter(evenement(EVT), 'submission.completed');
    expect(uploadFileMock).toHaveBeenCalledTimes(2);
    const appels = uploadFileMock.mock.calls as unknown as Array<[string, string, Buffer, string]>;
    const pdfAppel = appels[0]!;
    const certAppel = appels[1]!;
    expect(pdfAppel[1]).toMatch(
      /^sessions\/tenant-1\/SES-0048\/signed\/CONVENTION-org-1-[0-9a-f]{8}\.pdf$/,
    );
    expect(certAppel[1]).toBe(pdfAppel[1].replace(/\.pdf$/, '.audit-trail.pdf'));
    expect(pdfAppel[2]).toBe(PDF_SIGNE);
    expect(certAppel[2]).toBe(CERTIFICAT);
  });

  it('écrit le document, la demande et la trace DANS UNE SEULE transaction', async () => {
    await traiter(evenement(EVT), 'submission.completed');
    expect(transactionMock).toHaveBeenCalledTimes(1);
    // Rien ne passe par `prisma` directement.
    expect(documentUpdate).not.toHaveBeenCalled();

    const patchDoc = tx.documentUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(patchDoc.where.id).toBe('doc-conv');
    expect(patchDoc.data.status).toBe('signed');
    expect(patchDoc.data.signatureKind).toBe('E_SIGNATURE');
    expect(patchDoc.data.signedAt).toEqual(LE_20);
    expect(String(patchDoc.data.signedPdfUrl)).toMatch(/\/signed\/CONVENTION-org-1-.*\.pdf$/);

    const patchReq = tx.signatureRequestUpdate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(patchReq.data.status).toBe('DONE');
    expect(patchReq.data.completedAt).toEqual(LE_20);
    expect(String(patchReq.data.auditTrailUrl)).toMatch(/\.audit-trail\.pdf$/);
  });

  it('la trace `signature.completed` porte le certificat — c’est ce que les AGEFICE réclament', async () => {
    await traiter(evenement(EVT), 'submission.completed');
    const trace = tx.auditLogCreate.mock.calls[0]![0] as {
      data: { action: string; diff: Record<string, unknown> };
    };
    expect(trace.data.action).toBe('signature.completed');
    expect(String(trace.data.diff.auditTrailUrl)).toMatch(/\.audit-trail\.pdf$/);
    expect(trace.data.diff.status).toEqual({ before: 'sent_for_signature', after: 'signed' });
  });

  it('prévient les ADMIN — une par ADMIN, avec la session', async () => {
    userFindMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
    await traiter(evenement(EVT), 'submission.completed');
    const appel = notificationCreateMany.mock.calls[0]![0] as {
      data: Array<{ userId: string; type: string; payload: Record<string, unknown> }>;
    };
    expect(appel.data.map((n) => n.userId)).toEqual(['admin-1', 'admin-2']);
    expect(appel.data[0]!.type).toBe('signature.completed');
    expect(appel.data[0]!.payload).toMatchObject({ sessionCode: 'SES-0048' });
  });

  it('envoie l’exemplaire AUX SIGNATAIRES, avec les DEUX fichiers en pièces jointes', async () => {
    await traiter(evenement(EVT), 'submission.completed');
    expect(notifierExemplaireMock).toHaveBeenCalledTimes(1);
    const args = notifierExemplaireMock.mock.calls[0]![0] as {
      destinataires: Array<{ email: string }>;
      piecesJointes: Array<{ filename: string; content: Buffer }>;
      role: string;
    };
    expect(args.destinataires.map((d) => d.email)).toEqual([
      'claire@agence.fr',
      'laurent@start-academy.fr',
    ]);
    expect(args.piecesJointes).toHaveLength(2);
    expect(args.piecesJointes[0]!.content).toBe(PDF_SIGNE);
    expect(args.piecesJointes[1]!.filename).toMatch(/\.audit-trail\.pdf$/);
    // Le régime mémorisé à l'envoi, pas un régime recalculé aujourd'hui.
    expect(args.role).toBe('DIRIGEANT');
  });

  it('PUISSANCE — le téléchargement échoue : RIEN n’est écrit, et le rejeu est possible', async () => {
    const provider = providerFactice({
      downloadSignedDocument: vi.fn(async () => {
        throw new Error('502 chez le prestataire');
      }) as never,
    });
    const r = await traiter(evenement(EVT), 'submission.completed', provider);

    expect(r.motif).toBe('telechargement-impossible');
    expect(estRejouable(r.motif)).toBe(true);
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifierExemplaireMock).not.toHaveBeenCalled();
    // ⚠ LA MÉMOIRE EST EFFACÉE : sans ça, le rejeu serait dédupliqué et la
    // pièce resterait à jamais sans sa preuve.
    expect(webhookEventDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('PUISSANCE — un email qui échoue ne perd PAS la signature déjà écrite', async () => {
    notifierExemplaireMock.mockRejectedValue(new Error('SMTP mort'));
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await traiter(evenement(EVT), 'submission.completed');
    expect(r).toEqual({ traite: true, motif: 'signature-terminee' });
    expect(tx.documentUpdate).toHaveBeenCalledTimes(1);
    erreur.mockRestore();
  });
});

describe('refus et expiration — la pièce SORT du gel', () => {
  it('form.declined ⇒ DECLINED, et la pièce est relâchée par le chemin PARTAGÉ', async () => {
    const r = await traiter(
      evenement({ type: 'signer.declined', signerId: 'sg-client' }),
      'form.declined',
    );
    expect(r.motif).toBe('refus-enregistre');
    expect(relacherPiecesMock).toHaveBeenCalledTimes(1);
    const args = relacherPiecesMock.mock.calls[0]![0] as {
      statutDemande: string;
      action: string;
      userId: null;
      diff: Record<string, unknown>;
      regeneration: { action: string };
    };
    expect(args.statutDemande).toBe('DECLINED');
    expect(args.action).toBe('signature.declined');
    expect(args.userId).toBe(null);
    expect(args.diff.cause).toBe('Claire DUPONT a refusé de signer.');
    expect(args.regeneration.action).toBe('document.regenerated_after_decline');
  });

  it('le refus est DATÉ sur la ligne du signataire, sans toucher sa signature', async () => {
    await traiter(evenement({ type: 'signer.declined', signerId: 'sg-client' }), 'form.declined');
    const patch = requestUpdate.mock.calls[0]![0] as {
      data: { signers: Array<Record<string, unknown>> };
    };
    expect(patch.data.signers[0]!.declinedAt).toBe('2026-09-20T14:30:00.000Z');
    expect(patch.data.signers[0]!.signedAt).toBe(null);
  });

  it('submission.expired ⇒ EXPIRED, même chemin, autre motif', async () => {
    const r = await traiter(
      evenement({ type: 'request.expired', signerId: null }),
      'submission.expired',
    );
    expect(r.motif).toBe('expiration-enregistree');
    const args = relacherPiecesMock.mock.calls[0]![0] as {
      statutDemande: string;
      action: string;
      lastError: string;
    };
    expect(args.statutDemande).toBe('EXPIRED');
    expect(args.action).toBe('signature.expired');
    expect(args.lastError).toContain('expiré');
  });

  it('les ADMIN sont prévenus dans les deux cas', async () => {
    await traiter(evenement({ type: 'request.expired', signerId: null }), 'submission.expired');
    const appel = notificationCreateMany.mock.calls[0]![0] as {
      data: Array<{ type: string }>;
    };
    expect(appel.data[0]!.type).toBe('signature.expired');
  });
});

describe('un événement inconnu est mémorisé, pas traité', () => {
  it('rend un motif nommé et n’écrit rien', async () => {
    const r = await traiter(evenement({ type: 'unknown' }), 'submission.created');
    expect(r).toEqual({ traite: false, motif: 'evenement-ignore:submission.created' });
    expect(transactionMock).not.toHaveBeenCalled();
    // Mémorisé quand même : c'est ce qui l'empêche de revenir en boucle.
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
    expect(webhookEventDeleteMany).not.toHaveBeenCalled();
  });
});
