import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot C.2a-2 — `sendForSignature` (spec signature 2026-09-04 §5 lot C).
 *
 * Cette action n'envoie QUE ce qui a été confirmé au récapitulatif. Les trois
 * tests de puissance qu'elle doit tenir, et ce qu'ils rattrapent :
 *
 *  (a) HASH DIVERGENT ⇒ refus. La promesse « le clic confirme CE PDF-là » ne
 *      peut pas reposer sur l'ordre des écrans : deux admins en parallèle, ou
 *      une régénération déclenchée ailleurs entre l'aperçu et le clic,
 *      enverraient autre chose que ce qui a été relu. Retirer la comparaison de
 *      hash fait passer `createRequest` à 1 appel — le test rougit.
 *  (b) `signatureFieldCount === 0` ⇒ refus ET `provider.cancel` appelé. Sans
 *      l'annulation, une demande fantôme reste ouverte chez le prestataire et
 *      le prochain envoi fait doublon.
 *  (c) document déjà `signed` ⇒ refus sans `force`. Réémettre une pièce signée
 *      remplacerait une preuve par une demande.
 *
 * Les assertions portent sur les APPELS (jamais faits / faits une fois) et sur
 * le CONTENU exact des `signers`, pas sur un booléen `ok` — un `ok: true`
 * accompagné d'un refus passerait un test écrit à l'envers.
 */

const {
  sessionFindFirst,
  opcoFindMany,
  documentFindFirst,
  documentUpdate,
  tenantFindUnique,
  auditLogCreate,
  signatureRequestCreate,
  transactionMock,
  requireRoleMock,
  loadOfConfigMock,
  downloadFileMock,
  createRequestMock,
  cancelMock,
  getProviderMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  sessionFindFirst: vi.fn(),
  opcoFindMany: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  signatureRequestCreate: vi.fn(),
  transactionMock: vi.fn(),
  requireRoleMock: vi.fn(),
  loadOfConfigMock: vi.fn(),
  downloadFileMock: vi.fn(),
  createRequestMock: vi.fn(),
  cancelMock: vi.fn(),
  getProviderMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: sessionFindFirst },
    opcoCatalog: { findMany: opcoFindMany },
    document: { findFirst: documentFindFirst, update: documentUpdate },
    tenant: { findUnique: tenantFindUnique },
    signatureRequest: { create: signatureRequestCreate },
    auditLog: { create: auditLogCreate },
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

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  downloadFile: downloadFileMock,
}));

/**
 * Le module `provider.ts` est remplacé ENTIÈREMENT, sans `importActual` : il
 * lit `@qualiof/shared/env`, qui valide l'environnement AU CHARGEMENT et fait
 * tomber la suite sur un `DATABASE_URL` absent (hermétisme, cf. 17-02). La
 * classe d'erreur est donc redéfinie ici — et c'est celle-là que le code sous
 * test importe, donc son `instanceof` reste vrai.
 */
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
  generateConventionCore: vi.fn(),
  generateConventionEntrepriseCore: vi.fn(),
}));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: vi.fn() }));
vi.mock('../agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { sendForSignature } from '../signature-envoi';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const P_TNS = '44444444-4444-4444-8444-444444444444';
const P_SALARIE = '55555555-5555-4555-8555-555555555555';

const REGLE_AGEFICE = {
  code: 'AGEFICE',
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: 'STAGIAIRE',
  assiduiteSigner: 'STAGIAIRE',
};
const REGLE_OPCO_EP = {
  code: 'OPCO_EP',
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: null,
  assiduiteSigner: null,
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

function salarieAgence(
  contacts = [{ firstName: 'Paul', lastName: 'Martin', email: 'paul@agence.fr', isPrimary: true }],
) {
  return {
    id: P_SALARIE,
    sponsorOrgId: 'org-agence',
    person: {
      id: 'pers-2',
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@agence.fr',
      legalLinks: [
        {
          role: 'SALARIE',
          organizationId: 'org-agence',
          organization: { id: 'org-agence', opcoCode: 'OPCO_EP' },
        },
      ],
    },
    sponsorOrg: {
      id: 'org-agence',
      legalName: 'AGENCE MARTIN',
      brandName: 'Martin Immobilier',
      legalForm: 'SARL',
      representative: 'Paul MARTIN',
      opcoCode: 'OPCO_EP',
      contacts,
    },
  };
}

interface DocRow {
  id: string;
  tenantId: string;
  type: string;
  entityType: string;
  entityId: string;
  sessionId: string | null;
  participantId: string | null;
  pdfUrl: string;
  hashSha256: string;
  status: string;
}

let docs: DocRow[] = [];

function doc(over: Partial<DocRow> & { id: string; type: string }): DocRow {
  return {
    tenantId: TENANT_ID,
    entityType: 'participant',
    entityId: over.participantId ?? over.id,
    sessionId: SESSION_ID,
    participantId: null,
    pdfUrl: `cle/${over.id}.pdf`,
    hashSha256: `hash-${over.id}`,
    status: 'generated',
    ...over,
  } as DocRow;
}

function sessionAvec(participants: unknown[]) {
  sessionFindFirst.mockResolvedValue({ id: SESSION_ID, code: 'SES-0010', participants });
}

/** Les écritures réellement passées par le `tx` de la transaction. */
const ecrituresTx = {
  signatureRequestCreate: vi.fn(),
  documentUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  ecrituresTx.signatureRequestCreate.mockReset();
  ecrituresTx.documentUpdate.mockReset();
  ecrituresTx.auditLogCreate.mockReset();
  docs = [];

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
  opcoFindMany.mockResolvedValue([REGLE_AGEFICE, REGLE_OPCO_EP]);
  downloadFileMock.mockResolvedValue(Buffer.from('%PDF'));

  documentFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const trouve = docs.find((d) => {
      if (d.tenantId !== where.tenantId) return false;
      if (where.type !== undefined && d.type !== where.type) return false;
      if (where.sessionId !== undefined && d.sessionId !== where.sessionId) return false;
      if (where.participantId !== undefined && d.participantId !== where.participantId) {
        return false;
      }
      if (Array.isArray(where.OR)) {
        return (where.OR as Record<string, unknown>[]).some((clause) =>
          Object.entries(clause).every(
            ([champ, valeur]) => (d as unknown as Record<string, unknown>)[champ] === valeur,
          ),
        );
      }
      return true;
    });
    return trouve ?? null;
  });

  createRequestMock.mockImplementation(async () => ({
    providerId: 'sub-1',
    status: 'SENT',
    signers: [
      {
        role: 'Client',
        name: 'X',
        email: 'x@ex.fr',
        providerSignerId: 'sg-1',
        status: 'sent',
        signedAt: null,
        signUrl: 'https://docuseal.eu/s/abc',
      },
    ],
    expiresAt: null,
    signatureFieldCount: 2,
  }));
  cancelMock.mockResolvedValue(undefined);
  getProviderMock.mockReturnValue({
    name: 'dry-run',
    createRequest: createRequestMock,
    cancel: cancelMock,
  });

  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      signatureRequest: { create: ecrituresTx.signatureRequestCreate },
      document: { update: ecrituresTx.documentUpdate },
      auditLog: { create: ecrituresTx.auditLogCreate },
    }),
  );
});

describe('sendForSignature — n’envoie que ce qui a été confirmé', () => {
  it('(a) PUISSANCE — hash divergent : refus, aucun appel prestataire, aucune écriture', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-vu-a-l-apercu' }],
    });

    expect(createRequestMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(ecrituresTx.signatureRequestCreate).not.toHaveBeenCalled();
    expect(ecrituresTx.documentUpdate).not.toHaveBeenCalled();
    expect(ecrituresTx.auditLogCreate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envoyes).toEqual([]);
    expect(r.refus.map((x) => x.raison)).toEqual(['DOCUMENT_MODIFIE']);
    // Le message doit dire les trois choses : ce qui a changé, que RIEN n'est
    // parti, et le geste à faire. Sans la troisième, l'admin reclique.
    const message = r.refus[0]!.message;
    expect(message).toContain('Dossier AGEFICE');
    expect(message).toMatch(/rien n'a été envoyé/i);
    expect(message).toMatch(/récapitulatif/i);
  });

  it('(b) PUISSANCE — zéro champ de signature : annulation chez le prestataire, rien de persisté', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];
    createRequestMock.mockResolvedValue({
      providerId: 'sub-zombie',
      status: 'SENT',
      signers: [],
      expiresAt: null,
      signatureFieldCount: 0,
    });

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(createRequestMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith('sub-zombie');
    expect(ecrituresTx.signatureRequestCreate).not.toHaveBeenCalled();
    expect(ecrituresTx.documentUpdate).not.toHaveBeenCalled();
    expect(ecrituresTx.auditLogCreate).not.toHaveBeenCalled();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envoyes).toEqual([]);
    expect(r.refus.map((x) => x.raison)).toEqual(['AUCUN_CHAMP_DE_SIGNATURE']);
  });

  it('(c) PUISSANCE — document déjà signé : refus sans `force`, aucun appel prestataire', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [
      doc({
        id: 'doc-age',
        type: 'AGEFICE',
        participantId: P_TNS,
        entityId: P_TNS,
        status: 'signed',
      }),
    ];

    const sans = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(createRequestMock).not.toHaveBeenCalled();
    expect(sans.ok).toBe(true);
    if (!sans.ok) return;
    expect(sans.envoyes).toEqual([]);
    expect(sans.refus.map((x) => x.raison)).toEqual(['DEJA_SIGNE']);

    // …et avec `force`, la pièce repart : la garde est bien la garde, pas un mur.
    const avec = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
      force: true,
    });

    expect(createRequestMock).toHaveBeenCalledTimes(1);
    expect(avec.ok).toBe(true);
    if (!avec.ok) return;
    expect(avec.refus).toEqual([]);
    expect(avec.envoyes.map((e) => e.cle)).toEqual([`AGEFICE:${P_TNS}`]);
  });

  it('le dossier AGEFICE n’a QU’UN signataire — l’OF n’y re-signe pas', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    const appel = createRequestMock.mock.calls[0]![0] as { signers: unknown[] };
    // EXACTEMENT un. Le compte est asserté séparément de son contenu : un second
    // signataire glissé sur cette pièce doit rougir ici même si son contenu est
    // par ailleurs plausible.
    expect(appel.signers).toHaveLength(1);
    expect(appel.signers).toEqual([
      {
        role: 'Stagiaire',
        name: 'Florent HAUSSWIRTH',
        email: 'florent@ei.fr',
        order: 0,
      },
    ]);
    // L'OF ne figure NULLE PART : son exemplaire porte déjà l'image de sa
    // signature (`applyOfSignature`), il n'a pas à re-signer.
    expect(JSON.stringify(appel.signers)).not.toContain('Organisme de formation');
    expect(JSON.stringify(appel.signers)).not.toContain('laurent@start-academy.fr');
  });

  it('la convention porte DEUX signataires, le client puis l’OF (D-3)', async () => {
    sessionAvec([salarieAgence()]);
    docs = [
      doc({
        id: 'doc-conv',
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: 'org-agence',
        participantId: null,
      }),
    ];

    await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: 'CONVENTION:org-agence', hashConfirme: 'hash-doc-conv' }],
    });

    const appel = createRequestMock.mock.calls[0]![0] as { signers: unknown[] };
    expect(appel.signers).toHaveLength(2);
    expect(appel.signers).toEqual([
      { role: 'Client', name: 'Paul MARTIN', email: 'paul@agence.fr', order: 0 },
      {
        role: 'Organisme de formation',
        name: 'Laurent MARX',
        email: 'laurent@start-academy.fr',
        order: 1,
      },
    ]);
    // La salariée ne signe RIEN : sa convention est celle de son employeur.
    expect(JSON.stringify(appel.signers)).not.toContain('marie@agence.fr');
  });

  /**
   * ⚠ CE TEST COMBLE UN TROU RÉEL, mesuré le 11/09/2026 (demande n°1 de Laurent).
   *
   * Retirer `{ partie: 'OF' }` de `ANCRES_PAR_PIECE.ASSIDUITE` laissait la
   * suite web ENTIÈREMENT VERTE : 277 fichiers, 2760 tests, pas une assertion
   * pour dire que l'organisme signe l'attestation d'assiduité. La convention et
   * le dossier AGEFICE étaient gardés, l'assiduité non — et c'est précisément
   * la pièce que le lot B vient de brancher.
   *
   * Elle part avec le même ordre que la convention (client 0, OF 1), mais avec
   * le nom de rôle de SON gabarit : `Stagiaire`, pas `Client`. Déduire le nom du
   * rôle du régime enverrait un signataire que le PDF ne réclame pas, et le
   * champ resterait non attribué.
   */
  it('l’attestation d’assiduité porte DEUX signataires : le stagiaire, puis l’OF', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-assi', type: 'ASSIDUITE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'AFTER',
      cibles: [{ cle: `ASSIDUITE:${P_TNS}`, hashConfirme: 'hash-doc-assi' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refus).toEqual([]);

    const appel = createRequestMock.mock.calls[0]![0] as { signers: unknown[] };
    expect(appel.signers).toHaveLength(2);
    expect(appel.signers).toEqual([
      { role: 'Stagiaire', name: 'Florent HAUSSWIRTH', email: 'florent@ei.fr', order: 0 },
      {
        role: 'Organisme de formation',
        name: 'Laurent MARX',
        email: 'laurent@start-academy.fr',
        order: 1,
      },
    ]);
  });

  it('écrit dans UNE transaction : SignatureRequest + Document + AuditLog `signature.sent`', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    // Les trois écritures passent par `tx`, jamais par `prisma` directement.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(typeof transactionMock.mock.calls[0]![0]).toBe('function');
    expect(signatureRequestCreate).not.toHaveBeenCalled();
    expect(documentUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();

    const requete = ecrituresTx.signatureRequestCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(requete.data).toMatchObject({
      tenantId: TENANT_ID,
      provider: 'dry-run',
      providerId: 'sub-1',
      status: 'SENT',
      sessionId: SESSION_ID,
    });
    // D-9 : le lien de signature est PERSISTÉ ici ; aucun email n'est envoyé.
    expect(requete.data.signers).toEqual([
      expect.objectContaining({ signUrl: 'https://docuseal.eu/s/abc', providerSignerId: 'sg-1' }),
    ]);

    const patch = ecrituresTx.documentUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(patch.where.id).toBe('doc-age');
    expect(patch.data.status).toBe('sent_for_signature');
    expect(patch.data.signatureRequestId).toBe(requete.data.id);

    const journal = ecrituresTx.auditLogCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(journal.data).toMatchObject({
      tenantId: TENANT_ID,
      userId: USER_ID,
      entity: 'Document',
      entityId: 'doc-age',
      action: 'signature.sent',
    });
    expect(journal.data.diff).toMatchObject({
      signataire: {
        nom: 'Florent HAUSSWIRTH',
        email: 'florent@ei.fr',
        sourceEmail: 'PERSON',
      },
      status: { before: 'generated', after: 'sent_for_signature' },
    });

    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/sessions/${SESSION_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/app/sessions');
  });

  it('email saisi par l’admin : il est retenu ET journalisé, avec sa provenance', async () => {
    sessionAvec([
      salarieAgence([
        // Le représentant n'a pas d'email ; un autre contact en a un, il ne doit
        // servir à rien. Seule la saisie explicite fait dérogation.
        { firstName: 'Sophie', lastName: 'Bernard', email: 'sophie@agence.fr', isPrimary: false },
      ]),
    ]);
    docs = [
      doc({
        id: 'doc-conv',
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: 'org-agence',
        participantId: null,
      }),
    ];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [
        {
          cle: 'CONVENTION:org-agence',
          hashConfirme: 'hash-doc-conv',
          emailSaisi: 'p.martin@agence-martin.fr',
        },
      ],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refus).toEqual([]);

    const appel = createRequestMock.mock.calls[0]![0] as { signers: { email: string }[] };
    expect(appel.signers[0]!.email).toBe('p.martin@agence-martin.fr');
    expect(JSON.stringify(appel.signers)).not.toContain('sophie@agence.fr');

    const journal = ecrituresTx.auditLogCreate.mock.calls[0]![0] as {
      data: { diff: Record<string, unknown> };
    };
    expect(journal.data.diff.signataire).toEqual({
      nom: 'Paul MARTIN',
      email: 'p.martin@agence-martin.fr',
      sourceNom: 'ORG_REPRESENTATIVE',
      sourceEmail: 'SAISI_PAR_ADMIN',
    });
  });

  it('signataire sans email et sans saisie : refus nominatif, aucun appel prestataire', async () => {
    sessionAvec([
      salarieAgence([
        { firstName: 'Sophie', lastName: 'Bernard', email: 'sophie@agence.fr', isPrimary: false },
      ]),
    ]);
    docs = [
      doc({
        id: 'doc-conv',
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: 'org-agence',
        participantId: null,
      }),
    ];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: 'CONVENTION:org-agence', hashConfirme: 'hash-doc-conv' }],
    });

    expect(createRequestMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refus.map((x) => x.raison)).toEqual(['SIGNATAIRE_SANS_EMAIL']);
    const message = r.refus[0]!.message;
    expect(message).toContain('Paul MARTIN');
    expect(message).toContain('AGENCE MARTIN');
    expect(message).not.toContain('sophie@agence.fr');
  });

  it('document en cours de signature : refus, aucun doublon envoyé', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [
      doc({
        id: 'doc-age',
        type: 'AGEFICE',
        participantId: P_TNS,
        entityId: P_TNS,
        status: 'sent_for_signature',
      }),
    ];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
      force: true,
    });

    expect(createRequestMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // `force` ne contourne PAS un envoi en cours : ce serait deux demandes
    // concurrentes sur la même pièce.
    expect(r.refus.map((x) => x.raison)).toEqual(['ENVOI_EN_COURS']);
  });

  it('document absent : refus `DOC_NON_GENERE`, aucun appel prestataire', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(createRequestMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refus.map((x) => x.raison)).toEqual(['DOC_NON_GENERE']);
  });

  it('la transaction échoue APRÈS création de la submission : annulation chez le prestataire', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];
    transactionMock.mockRejectedValue(new Error('deadlock'));

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(cancelMock).toHaveBeenCalledWith('sub-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envoyes).toEqual([]);
    expect(r.refus.map((x) => x.raison)).toEqual(['ERREUR_PRESTATAIRE']);
  });

  it('un refus ne fait pas tomber le lot : la pièce saine part quand même', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [
      doc({ id: 'doc-conv', type: 'CONVENTION', participantId: P_TNS, entityId: P_TNS }),
      doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS }),
    ];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [
        { cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' },
        { cle: 'CONVENTION:org-ei-1', hashConfirme: 'hash-perime' },
      ],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envoyes.map((e) => e.cle)).toEqual([`AGEFICE:${P_TNS}`]);
    expect(r.refus.map((x) => [x.cle, x.raison])).toEqual([
      ['CONVENTION:org-ei-1', 'DOCUMENT_MODIFIE'],
    ]);
  });

  it('clé qui ne fait plus partie du plan : refus nommé, rien d’envoyé', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: 'ASSIDUITE:' + P_TNS, hashConfirme: 'hash-x' }],
    });

    expect(createRequestMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refus.map((x) => x.raison)).toEqual(['CLE_INCONNUE']);
  });

  it('session d’un autre tenant : refus global, aucun document lu', async () => {
    sessionFindFirst.mockResolvedValue(null);

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(r.ok).toBe(false);
    expect(documentFindFirst).not.toHaveBeenCalled();
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it('provider non configuré : refus global, message du provider rendu tel quel', async () => {
    const { SignatureNotConfiguredError } = await import('@/lib/signature/provider');
    getProviderMock.mockImplementation(() => {
      throw new SignatureNotConfiguredError('DOCUSEAL_API_KEY absente — signature indisponible.');
    });

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(r).toEqual({ ok: false, error: 'DOCUSEAL_API_KEY absente — signature indisponible.' });
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });

  it('rôle insuffisant : refus global avant tout I/O', async () => {
    const { ForbiddenError } = await import('@/lib/rbac');
    requireRoleMock.mockRejectedValue(new ForbiddenError('Accès refusé'));

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(r.ok).toBe(false);
    expect(getProviderMock).not.toHaveBeenCalled();
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });

  it('aucune cible : refus global — on ne « prépare » pas un envoi vide', async () => {
    const r = await sendForSignature({ sessionId: SESSION_ID, scope: 'BEFORE', cibles: [] });

    expect(r.ok).toBe(false);
    expect(getProviderMock).not.toHaveBeenCalled();
  });
});
