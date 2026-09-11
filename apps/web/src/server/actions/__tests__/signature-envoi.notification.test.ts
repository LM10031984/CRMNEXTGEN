import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T2.3 — LE FIL. `sendForSignature` → `notifierSignataire` → `sendMail`.
 *
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL NE SE NÉGOCIE PAS. Onze tests de
 * ce chantier se sont révélés ne rien garder, et **aucun n'a été repéré en
 * relecture** : tous par mutation. Le défaut était toujours le même — le CALCUL
 * était gardé, le CÂBLAGE ne l'était pas. Un gabarit parfait, un notifier
 * parfait, et personne pour les appeler : tous leurs tests restent verts, et
 * aucun signataire ne reçoit jamais rien.
 *
 * La mutation qui valide ce fichier : **retirer purement et simplement l'appel
 * à `notifierSignataire` dans `signature-envoi.ts`**. Si ces tests restent
 * verts, ils ne gardent rien et doivent être réécrits avant d'aller plus loin.
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
  sendMailMock,
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
  sendMailMock: vi.fn(),
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
  UserRole: { ADMIN: 'ADMIN', MANAGER: 'MANAGER' },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));
vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: requireRoleMock };
});
vi.mock('@/lib/of-config', () => ({ loadOfConfig: loadOfConfigMock }));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'qualiof-docs', downloadFile: downloadFileMock }));
vi.mock('@/lib/mailer', () => ({ sendMail: sendMailMock }));
vi.mock('@/lib/signature/provider', () => {
  class SignatureNotConfiguredError extends Error {}
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

const EMAIL_OF = 'laurent@start-academy.fr';
const EMAIL_RESPONSABLE = 'paul@agence.fr';
const EMAIL_TNS = 'florent@ei.fr';

function tnsViaSonEi() {
  return {
    id: P_TNS,
    sponsorOrgId: 'org-ei-1',
    person: {
      id: 'pers-1',
      firstName: 'Florent',
      lastName: 'Hausswirth',
      email: EMAIL_TNS,
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

function salarieAgence() {
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
      contacts: [
        { firstName: 'Paul', lastName: 'Martin', email: EMAIL_RESPONSABLE, isPrimary: true },
      ],
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
  sessionFindFirst.mockResolvedValue({
    id: SESSION_ID,
    code: 'SES-0010',
    product: { title: "L'IA au service de l'agent commercial" },
    participants,
  });
}

/** Le prestataire rend un lien PAR signataire, distinct, pour qu'on voie lequel part. */
function prestataireRendUnLienParSignataire() {
  createRequestMock.mockImplementation(
    async ({ signers }: { signers: Array<{ role: string; name: string; email: string }> }) => ({
      providerId: 'sub-1',
      status: 'SENT',
      signers: signers.map((s, i) => ({
        role: s.role,
        name: s.name,
        email: s.email,
        providerSignerId: `sg-${i}`,
        status: 'sent',
        signedAt: null,
        signUrl: `https://docuseal.eu/s/${encodeURIComponent(s.role)}`,
      })),
      expiresAt: null,
      signatureFieldCount: 2,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  docs = [];
  requireRoleMock.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, role: 'ADMIN' });
  loadOfConfigMock.mockResolvedValue({
    name: 'Start Academy',
    siret: '12345678900011',
    rnq: '11755555555',
    addressFull: '10 rue des Tests',
    resp: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant', email: EMAIL_OF },
  });
  tenantFindUnique.mockResolvedValue({
    signatoryName: 'Laurent MARX',
    signatoryEmail: EMAIL_OF,
    signatoryTitle: 'Gérant',
    signatoryOrder: 'AFTER',
  });
  opcoFindMany.mockResolvedValue([
    { code: 'AGEFICE', conventionSigner: 'DIRIGEANT', ageficeSigner: 'STAGIAIRE', assiduiteSigner: 'STAGIAIRE' },
    { code: 'OPCO_EP', conventionSigner: 'DIRIGEANT', ageficeSigner: null, assiduiteSigner: null },
  ]);
  downloadFileMock.mockResolvedValue(Buffer.from('%PDF'));
  documentFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const trouve = docs.find((d) => {
      if (d.tenantId !== where.tenantId) return false;
      if (where.type !== undefined && d.type !== where.type) return false;
      if (where.sessionId !== undefined && d.sessionId !== where.sessionId) return false;
      if (where.participantId !== undefined && d.participantId !== where.participantId) return false;
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
  prestataireRendUnLienParSignataire();
  cancelMock.mockResolvedValue(undefined);
  getProviderMock.mockReturnValue({
    name: 'dry-run',
    createRequest: createRequestMock,
    cancel: cancelMock,
  });
  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      signatureRequest: { create: vi.fn() },
      document: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    }),
  );
  auditLogCreate.mockResolvedValue({ id: 'audit-1' });
  sendMailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
});

function destinataires() {
  return sendMailMock.mock.calls.map((c) => (c[0] as { to: string }).to);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T2.3 — LE FIL : un envoi réussi expédie un email, exactement un', () => {
  it('une pièce envoyée ⇒ `sendMail` appelé UNE fois, au signataire de rang 0', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.envoyes).toHaveLength(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(destinataires()).toEqual(['florent@ei.fr']);
    expect(r.envoyes[0]!.notification).toEqual({
      envoye: true,
      destinataire: 'florent@ei.fr',
      partie: 'CLIENT',
      motif: null,
    });
  });

  it('PUISSANCE — DEUX pièces ⇒ DEUX emails, un par pièce, pas un pour le lot', async () => {
    sessionAvec([tnsViaSonEi(), salarieAgence()]);
    docs = [
      doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS }),
      doc({ id: 'doc-conv', type: 'CONVENTION', entityType: 'organization', entityId: 'org-agence' }),
    ];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [
        { cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' },
        { cle: 'CONVENTION:org-agence', hashConfirme: 'hash-doc-conv' },
      ],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.envoyes).toHaveLength(2);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(new Set(destinataires())).toEqual(new Set(['florent@ei.fr', 'paul@agence.fr']));
  });

  it('une pièce REFUSÉE n’envoie aucun email — le refus est antérieur à tout', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-vu-a-l-apercu' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.refus).toHaveLength(1);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('T2.4 — D-3/D-8 jusqu’au bout : l’ordre décide du destinataire', () => {
  it('`signatoryOrder = AFTER` ⇒ l’email part au RESPONSABLE de l’organisation', async () => {
    sessionAvec([salarieAgence()]);
    docs = [
      doc({ id: 'doc-conv', type: 'CONVENTION', entityType: 'organization', entityId: 'org-agence' }),
    ];

    await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: 'CONVENTION:org-agence', hashConfirme: 'hash-doc-conv' }],
    });

    expect(destinataires()).toEqual(['paul@agence.fr']);
  });

  it('`signatoryOrder = BEFORE` ⇒ l’email part à l’ORGANISME, qui signe en premier', async () => {
    tenantFindUnique.mockResolvedValue({
      signatoryName: 'Laurent MARX',
      signatoryEmail: EMAIL_OF,
      signatoryTitle: 'Gérant',
      signatoryOrder: 'BEFORE',
    });
    sessionAvec([salarieAgence()]);
    docs = [
      doc({ id: 'doc-conv', type: 'CONVENTION', entityType: 'organization', entityId: 'org-agence' }),
    ];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: 'CONVENTION:org-agence', hashConfirme: 'hash-doc-conv' }],
    });

    expect(destinataires()).toEqual(['laurent@start-academy.fr']);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.envoyes[0]!.notification.partie).toBe('OF');
  });
});

describe('T2.8 — l’envoi SURVIT à l’email : on n’annule pas une demande pour un SMTP', () => {
  it('`sendMail` rejette ⇒ la pièce est quand même dans `envoyes`, motif `erreur-smtp`', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP injoignable'));
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.envoyes).toHaveLength(1);
    expect(r.envoyes[0]!.notification.motif).toBe('erreur-smtp');
    // La demande est créée chez le prestataire : on ne l'annule PAS.
    expect(cancelMock).not.toHaveBeenCalled();
    erreur.mockRestore();
  });

  it('catégorie décochée ⇒ la pièce part quand même, et l’écran a de quoi le dire', async () => {
    sendMailMock.mockResolvedValue({ ok: true, dryRun: true, suppressed: true });
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    const r = await sendForSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [{ cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' }],
    });

    if (!r.ok) throw new Error('inatteignable');
    expect(r.envoyes[0]!.notification).toEqual({
      envoye: false,
      destinataire: 'florent@ei.fr',
      partie: 'CLIENT',
      motif: 'categorie-decochee',
    });
  });
});

describe('la configuration d’organisme est lue HORS de la boucle', () => {
  /**
   * ⚠ ON N'ASSERTE PAS « une seule fois », et c'est délibéré : `loadOfConfig`
   * est DÉJÀ appelée par `resoudreSignataireOf` (`lib/signature/signataire-of.ts`),
   * elle-même hors de la boucle. Figer un chiffre absolu rendrait ce test
   * solidaire d'un détail qui ne le regarde pas.
   *
   * Ce qui compte, et ce que le test garde : le nombre d'appels ne GRANDIT PAS
   * avec le nombre de pièces. Une session de 8 dossiers AGEFICE ferait sinon 8
   * lectures identiques de la même configuration.
   */
  async function compterPourNPieces(cibles: Array<{ cle: string; hashConfirme: string }>) {
    vi.clearAllMocks();
    loadOfConfigMock.mockResolvedValue({
      name: 'Start Academy',
      siret: '12345678900011',
      rnq: '11755555555',
      addressFull: '10 rue des Tests',
      resp: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant', email: EMAIL_OF },
    });
    tenantFindUnique.mockResolvedValue({
      signatoryName: 'Laurent MARX',
      signatoryEmail: EMAIL_OF,
      signatoryTitle: 'Gérant',
      signatoryOrder: 'AFTER',
    });
    opcoFindMany.mockResolvedValue([
      { code: 'AGEFICE', conventionSigner: 'DIRIGEANT', ageficeSigner: 'STAGIAIRE', assiduiteSigner: 'STAGIAIRE' },
      { code: 'OPCO_EP', conventionSigner: 'DIRIGEANT', ageficeSigner: null, assiduiteSigner: null },
    ]);
    downloadFileMock.mockResolvedValue(Buffer.from('%PDF'));
    prestataireRendUnLienParSignataire();
    getProviderMock.mockReturnValue({
      name: 'dry-run',
      createRequest: createRequestMock,
      cancel: cancelMock,
    });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        signatureRequest: { create: vi.fn() },
        document: { update: vi.fn() },
        auditLog: { create: vi.fn() },
      }),
    );
    auditLogCreate.mockResolvedValue({ id: 'audit-1' });
    sendMailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
    requireRoleMock.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, role: 'ADMIN' });
    sessionAvec([tnsViaSonEi(), salarieAgence()]);
    docs = [
      doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS }),
      doc({ id: 'doc-conv', type: 'CONVENTION', entityType: 'organization', entityId: 'org-agence' }),
    ];
    await sendForSignature({ sessionId: SESSION_ID, scope: 'BEFORE', cibles });
    return loadOfConfigMock.mock.calls.length;
  }

  it('deux pièces ne coûtent pas plus de lectures qu’une seule', async () => {
    const pourUne = await compterPourNPieces([
      { cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' },
    ]);
    const pourDeux = await compterPourNPieces([
      { cle: `AGEFICE:${P_TNS}`, hashConfirme: 'hash-doc-age' },
      { cle: 'CONVENTION:org-agence', hashConfirme: 'hash-doc-conv' },
    ]);
    expect(pourDeux).toBe(pourUne);
  });
});
