import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot C.2b-bis — sortir une pièce du GEL, et lui rendre le lien de signature.
 *
 * CE QUE CE LOT RATTRAPE, dit crûment. Depuis C.2a, un envoi réussi pose
 * `Document.status = 'sent_for_signature'`. Dès lors `preparerEnvoiSignature`
 * refuse de régénérer la pièce et `sendForSignature` refuse de la renvoyer
 * (`ENVOI_EN_COURS`, que `force` ne lève pas). Personne n'a reçu de lien — D-9
 * repousse l'email au lot C.2c — donc le webhook du lot C.3 ne se déclenchera
 * jamais : la pièce est gelée SANS RECOURS. Pire, `messageEnvoiEnCours` promet
 * « Annulez l'envoi en cours », un geste qui n'existait nulle part.
 *
 * DEUX RÉPARATIONS, ET LEURS TESTS DE PUISSANCE :
 *
 *  (1) `signUrl` remonte jusqu'à l'appelant. Il est persisté dans
 *      `SignatureRequest.signers[]` depuis le lot B, mais aucun chemin de
 *      lecture ne l'exposait : l'admin ne pouvait même pas le communiquer à la
 *      main en attendant C.2c.
 *
 *  (2) `annulerEnvoiSignature` annule CHEZ LE PRESTATAIRE d'abord, puis
 *      relâche le document dans la MÊME transaction que sa trace. L'ordre n'est
 *      pas décoratif : marquer `CANCELED` en local pendant que la demande reste
 *      ouverte chez DocuSeal laisserait quelqu'un signer une pièce que QualiOF
 *      croit annulée — et le webhook de C.3 apposerait cette signature sur un
 *      document entre-temps régénéré.
 *
 *  (3) L'annulation régénère EN SENS INVERSE (`signatureTags: false`).
 *      Symétrie de l'envoi : sans elle, le document resterait dans sa version à
 *      ancres et SANS le tampon de l'OF — un admin qui le téléchargerait
 *      récupérerait une convention non signée par l'organisme, régression par
 *      rapport à l'état d'avant l'envoi.
 *      Le seul cas où l'on NE régénère PAS est celui où l'on détruirait une
 *      preuve : les générateurs commencent tous par un `deleteMany`.
 */

const {
  sessionFindFirst,
  opcoFindMany,
  documentFindFirst,
  documentUpdate,
  tenantFindUnique,
  auditLogCreate,
  auditLogFindFirst,
  signatureRequestCreate,
  signatureRequestFindFirst,
  signatureRequestUpdate,
  transactionMock,
  requireRoleMock,
  loadOfConfigMock,
  downloadFileMock,
  createRequestMock,
  cancelMock,
  getProviderMock,
  revalidatePathMock,
  conventionCoreMock,
  conventionEntrepriseMock,
  ageficeMock,
  assiduiteMock,
} = vi.hoisted(() => ({
  sessionFindFirst: vi.fn(),
  opcoFindMany: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  auditLogFindFirst: vi.fn(),
  signatureRequestCreate: vi.fn(),
  signatureRequestFindFirst: vi.fn(),
  signatureRequestUpdate: vi.fn(),
  transactionMock: vi.fn(),
  requireRoleMock: vi.fn(),
  loadOfConfigMock: vi.fn(),
  downloadFileMock: vi.fn(),
  createRequestMock: vi.fn(),
  cancelMock: vi.fn(),
  getProviderMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  conventionCoreMock: vi.fn(),
  conventionEntrepriseMock: vi.fn(),
  ageficeMock: vi.fn(),
  assiduiteMock: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: sessionFindFirst },
    opcoCatalog: { findMany: opcoFindMany },
    document: { findFirst: documentFindFirst, update: documentUpdate },
    tenant: { findUnique: tenantFindUnique },
    signatureRequest: {
      create: signatureRequestCreate,
      findFirst: signatureRequestFindFirst,
      update: signatureRequestUpdate,
    },
    auditLog: { create: auditLogCreate, findFirst: auditLogFindFirst },
    $transaction: transactionMock,
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: requireRoleMock };
});

vi.mock('@/lib/of-config', () => ({ loadOfConfig: loadOfConfigMock }));

vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'qualiof-docs', downloadFile: downloadFileMock }));

/** Remplacé ENTIÈREMENT, sans `importActual` : `provider.ts` lit `@qualiof/shared/env`. */
vi.mock('@/lib/signature/provider', () => {
  class SignatureNotConfiguredError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SignatureNotConfiguredError';
    }
  }
  return { getSignatureProvider: getProviderMock, SignatureNotConfiguredError };
});

vi.mock('@/lib/closure/convention-core', () => ({
  generateConventionCore: conventionCoreMock,
  generateConventionEntrepriseCore: conventionEntrepriseMock,
}));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: ageficeMock }));
vi.mock('../agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: assiduiteMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { annulerEnvoiSignature, sendForSignature } from '../signature-envoi';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const P_TNS = '44444444-4444-4444-8444-444444444444';
const REQ_ID = '66666666-6666-4666-8666-666666666666';

const REGLE_AGEFICE = {
  code: 'AGEFICE',
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: 'STAGIAIRE',
  assiduiteSigner: 'STAGIAIRE',
};

function tnsViaSonEi() {
  return {
    id: P_TNS,
    sponsorOrgId: 'org-ei-1',
    person: {
      id: 'pers-1',
      firstName: 'Florent',
      lastName: 'Hausswirth',
      email: 'florent@ei.fr',
      legalLinks: [
        {
          role: 'EI_SELF',
          organizationId: 'org-ei-1',
          organization: { id: 'org-ei-1', opcoCode: 'AGEFICE' },
        },
      ],
    },
    sponsorOrg: {
      id: 'org-ei-1',
      legalName: 'EI HAUSSWIRTH',
      brandName: null,
      legalForm: 'EI',
      representative: null,
      opcoCode: 'AGEFICE',
      contacts: [],
    },
  };
}

/** Les écritures réellement passées par le `tx` de la transaction. */
const ecrituresTx = {
  signatureRequestCreate: vi.fn(),
  signatureRequestUpdate: vi.fn(),
  documentUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
};

function demandeEnvoyee(over: Record<string, unknown> = {}) {
  return {
    id: REQ_ID,
    providerId: 'sub-1',
    status: 'SENT',
    sessionId: SESSION_ID,
    documents: [
      {
        id: 'doc-age',
        type: 'AGEFICE',
        entityType: 'participant',
        entityId: P_TNS,
        sessionId: SESSION_ID,
        participantId: P_TNS,
        status: 'sent_for_signature',
        signedPdfUrl: null,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ecrituresTx.signatureRequestCreate.mockReset();
  ecrituresTx.signatureRequestUpdate.mockReset();
  ecrituresTx.documentUpdate.mockReset();
  ecrituresTx.auditLogCreate.mockReset();

  requireRoleMock.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, role: 'ADMIN' });
  loadOfConfigMock.mockResolvedValue({
    name: 'Start Academy',
    resp: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant', email: 'laurent@start-academy.fr' },
  });
  tenantFindUnique.mockResolvedValue({
    signatoryName: 'Laurent MARX',
    signatoryEmail: 'laurent@start-academy.fr',
    signatoryTitle: 'Gérant',
    signatoryOrder: 'AFTER',
  });
  opcoFindMany.mockResolvedValue([REGLE_AGEFICE]);
  downloadFileMock.mockResolvedValue(Buffer.from('%PDF'));
  auditLogFindFirst.mockResolvedValue(null);
  cancelMock.mockResolvedValue(undefined);
  conventionCoreMock.mockResolvedValue({ ok: true });
  conventionEntrepriseMock.mockResolvedValue({ ok: true });
  ageficeMock.mockResolvedValue({ ok: true });
  assiduiteMock.mockResolvedValue({ ok: true });

  createRequestMock.mockResolvedValue({
    providerId: 'sub-1',
    status: 'SENT',
    signers: [
      {
        role: 'Stagiaire',
        name: 'Florent HAUSSWIRTH',
        email: 'florent@ei.fr',
        providerSignerId: 'sg-1',
        status: 'sent',
        signedAt: null,
        signUrl: 'https://docuseal.eu/s/le-lien-du-stagiaire',
      },
    ],
    expiresAt: null,
    signatureFieldCount: 1,
  });
  getProviderMock.mockReturnValue({
    name: 'dry-run',
    createRequest: createRequestMock,
    cancel: cancelMock,
  });

  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      signatureRequest: {
        create: ecrituresTx.signatureRequestCreate,
        update: ecrituresTx.signatureRequestUpdate,
      },
      document: { update: ecrituresTx.documentUpdate },
      auditLog: { create: ecrituresTx.auditLogCreate },
    }),
  );
});

describe('sendForSignature — le lien de signature remonte jusqu’à l’appelant', () => {
  it('PUISSANCE — `signUrl` du signataire côté bénéficiaire est rendu, pas seulement persisté', async () => {
    sessionFindFirst.mockResolvedValue({
      id: SESSION_ID,
      code: 'SES-0010',
      participants: [tnsViaSonEi()],
    });
    documentFindFirst.mockResolvedValue({
      id: 'doc-age',
      pdfUrl: 'cle/doc-age.pdf',
      hashSha256: 'hash-doc-age',
      status: 'generated',
    });

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envoyes).toHaveLength(1);
    expect(r.envoyes[0]?.signUrl).toBe('https://docuseal.eu/s/le-lien-du-stagiaire');
  });
});

describe('annulerEnvoiSignature — la pièce sort du gel', () => {
  it('PUISSANCE — annule chez le prestataire, passe la demande en CANCELED, relâche le document', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    const r = await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(r.ok).toBe(true);

    // (a) le prestataire est prévenu, avec SON identifiant.
    expect(cancelMock).toHaveBeenCalledWith('sub-1');

    // (b) la demande locale suit.
    expect(ecrituresTx.signatureRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQ_ID },
        data: expect.objectContaining({ status: 'CANCELED' }),
      }),
    );

    // (c) le document RETROUVE son état d'avant : ni gelé, ni rattaché.
    expect(ecrituresTx.documentUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-age' },
      data: { status: 'generated', signatureRequestId: null },
    });

    // (d) la trace est DANS la transaction, pas à côté.
    const actions = ecrituresTx.auditLogCreate.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(actions).toContain('signature.canceled');
  });

  it('PUISSANCE — le document est régénéré EN SENS INVERSE, sans ancres', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(ageficeMock).toHaveBeenCalledWith(P_TNS, { signatureTags: false });
  });

  it('l’échec du prestataire n’écrit RIEN en local — la demande resterait ouverte chez lui', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());
    cancelMock.mockRejectedValue(new Error('DocuSeal injoignable'));

    const r = await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('DocuSeal injoignable');
    expect(transactionMock).not.toHaveBeenCalled();
    expect(ageficeMock).not.toHaveBeenCalled();
  });

  it('une demande déjà SIGNÉE n’est pas annulable : on ne retire pas une preuve', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee({ status: 'DONE' }));

    const r = await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(r.ok).toBe(false);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('une demande d’un AUTRE espace est introuvable — la recherche est scopée tenantId', async () => {
    signatureRequestFindFirst.mockResolvedValue(null);

    const r = await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(r.ok).toBe(false);
    expect(signatureRequestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: REQ_ID, tenantId: TENANT_ID }),
      }),
    );
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('rend au document le statut que le JOURNAL lui connaissait avant l’envoi, et ne le régénère pas si ce serait détruire une preuve', async () => {
    signatureRequestFindFirst.mockResolvedValue(
      demandeEnvoyee({
        documents: [
          {
            id: 'doc-conv',
            type: 'CONVENTION',
            entityType: 'participant',
            entityId: P_TNS,
            sessionId: SESSION_ID,
            participantId: P_TNS,
            status: 'sent_for_signature',
            signedPdfUrl: 'cle/doc-conv-signe.pdf',
          },
        ],
      }),
    );
    // Renvoi forcé d'une pièce déjà signée : le journal en garde la trace.
    auditLogFindFirst.mockResolvedValue({
      diff: { status: { before: 'signed', after: 'sent_for_signature' } },
    });

    const r = await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(r.ok).toBe(true);
    expect(ecrituresTx.documentUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-conv' },
      data: { status: 'signed', signatureRequestId: null },
    });
    // Les générateurs commencent tous par un `deleteMany` : régénérer ici
    // effacerait le PDF signé. On s'abstient, et on le DIT.
    expect(conventionCoreMock).not.toHaveBeenCalled();
    if (!r.ok) return;
    expect(r.pieces[0]?.regeneree).toBe(false);
    expect(r.pieces[0]?.raisonNonRegeneree).toContain('signé');
  });

  it('exige ADMIN ou MANAGER — exactement le niveau des deux actions d’envoi', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    expect(requireRoleMock).toHaveBeenCalledWith(['ADMIN', 'MANAGER']);
  });
});

/**
 * Lot C.2b-3 — le MOTIF de l'annulation entre dans la trace.
 *
 * Une annulation volontaire (l'admin clique « Annuler l'envoi ») et une
 * annulation provoquée par un dépôt de scan (« une pièce, un seul chemin
 * ouvert », règle Laurent du 11/09/2026) produisaient exactement la même ligne
 * de journal. Or c'est la question qu'un auditeur pose en premier devant deux
 * preuves d'une même pièce : pourquoi l'envoi électronique s'est-il arrêté ?
 *
 * Le contrat de `annulerEnvoiSignature` est donc ÉTENDU — pas contourné : le
 * motif est un champ d'entrée validé par Zod, avec une valeur par défaut qui
 * préserve l'appelant existant (le bouton du bloc « Signature »).
 */
describe('annulerEnvoiSignature — le motif est porté par le contrat', () => {
  it('sans motif fourni, la trace dit « demandé par l’utilisateur » — le bouton du bloc n’a pas à le préciser', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    await annulerEnvoiSignature({ signatureRequestId: REQ_ID });

    const trace = ecrituresTx.auditLogCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; diff?: unknown } }).data)
      .find((d) => d.action === 'signature.canceled');
    expect((trace?.diff as { motif?: unknown }).motif).toBe('user_requested');
  });

  it('PUISSANCE — un motif fourni ressort TEL QUEL dans la trace, distinguable du cas volontaire', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    await annulerEnvoiSignature({ signatureRequestId: REQ_ID, motif: 'scan_deposited' });

    const trace = ecrituresTx.auditLogCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; diff?: unknown } }).data)
      .find((d) => d.action === 'signature.canceled');
    expect((trace?.diff as { motif?: unknown }).motif).toBe('scan_deposited');
  });

  it('un motif inconnu est REFUSÉ — le journal ne prend pas du texte libre', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    const r = await annulerEnvoiSignature({
      signatureRequestId: REQ_ID,
      motif: 'parce que voilà',
    });

    expect(r.ok).toBe(false);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('la trace garde AUSSI la phrase lisible, à côté du code', async () => {
    signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());

    await annulerEnvoiSignature({ signatureRequestId: REQ_ID, motif: 'scan_deposited' });

    const trace = ecrituresTx.auditLogCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; diff?: unknown } }).data)
      .find((d) => d.action === 'signature.canceled');
    const texte = (trace?.diff as { motifTexte?: unknown }).motifTexte;
    expect(typeof texte).toBe('string');
    expect(texte as string).toContain('scan');
  });
});
