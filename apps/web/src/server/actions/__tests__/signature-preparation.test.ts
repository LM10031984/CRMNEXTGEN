import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot C.2a-2 — `preparerEnvoiSignature` (spec signature 2026-09-04 §5 lot C).
 *
 * DÉCISION STRUCTURANTE (Laurent, 10/09/2026) : « la régénération avec ancres se
 * fait à l'ouverture du récapitulatif, qui affiche un aperçu du PDF exact qui
 * partira ; le clic Envoyer confirme ce PDF-là, jamais une autre version. »
 *
 * D'où DEUX server actions, et non une. Celle-ci prépare : elle calcule le plan,
 * régénère les pièces concernées AVEC leurs ancres, écrase `pdfUrl`, recalcule
 * `hashSha256`, journalise `document.regenerated_for_signature`, et rend les
 * hashes que `sendForSignature` exigera de retrouver à l'identique.
 *
 * Ce que ces tests verrouillent, et pourquoi :
 *  1. la régénération passe `signatureTags: true` aux TROIS gabarits, sans
 *     aucune branche sur le type de document — c'est le gabarit qui sait s'il
 *     garde le tampon de l'OF (le formulaire AGEFICE le garde, une seule partie
 *     y signe) ;
 *  2. un document déjà parti (ou déjà signé) n'est JAMAIS régénéré : les
 *     générateurs commencent tous par un `deleteMany`, régénérer effacerait la
 *     pièce en cours de signature ;
 *  3. un signataire sans email n'empêche pas l'aperçu : l'empêchement est rendu
 *     AVEC le hash, pour que C.2b puisse proposer la saisie d'adresse ;
 *  4. le scope tenant, sur la session comme sur les documents.
 */

const {
  sessionFindFirst,
  opcoFindMany,
  documentFindFirst,
  tenantFindUnique,
  auditLogCreate,
  requireRoleMock,
  loadOfConfigMock,
  conventionEntrepriseCoreMock,
  conventionCoreMock,
  ageficeMock,
  assiduiteMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  sessionFindFirst: vi.fn(),
  opcoFindMany: vi.fn(),
  documentFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  requireRoleMock: vi.fn(),
  loadOfConfigMock: vi.fn(),
  conventionEntrepriseCoreMock: vi.fn(),
  conventionCoreMock: vi.fn(),
  ageficeMock: vi.fn(),
  assiduiteMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: sessionFindFirst },
    opcoCatalog: { findMany: opcoFindMany },
    document: { findFirst: documentFindFirst, update: vi.fn() },
    tenant: { findUnique: tenantFindUnique },
    signatureRequest: { create: vi.fn() },
    auditLog: { create: auditLogCreate },
    $transaction: vi.fn(),
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
  downloadFile: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

/**
 * Hermétisme (cf. 17-02) : `provider.ts` valide l'environnement AU CHARGEMENT.
 * La préparation ne s'en sert pas, mais elle vit dans le même fichier que
 * l'envoi — le module est donc chargé, et sans ce mock la suite tombe sur un
 * `DATABASE_URL` absent.
 */
vi.mock('@/lib/signature/provider', () => {
  class SignatureNotConfiguredError extends Error {}
  return {
    getSignatureProvider: vi.fn(),
    SignatureNotConfiguredError,
  };
});

vi.mock('@/lib/closure/convention-core', () => ({
  generateConventionCore: conventionCoreMock,
  generateConventionEntrepriseCore: conventionEntrepriseCoreMock,
}));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: ageficeMock }));
vi.mock('../agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: assiduiteMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { preparerEnvoiSignature } from '../signature-envoi';

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

/** TNS dirigeant de son EI : lien EI_SELF vers son commanditaire. */
function tnsViaSonEi(over: Record<string, unknown> = {}) {
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
      ...(over.person ?? {}),
    },
    sponsorOrg: {
      id: 'org-ei-1',
      legalName: 'EI HAUSSWIRTH',
      brandName: null,
      legalForm: 'EI',
      representative: null,
      opcoCode: 'AGEFICE',
      contacts: [],
      ...(over.sponsorOrg ?? {}),
    },
  };
}

/** Salarié d'une agence financée par un OPCO : c'est le dirigeant qui signe. */
function salarieAgence(over: Record<string, unknown> = {}) {
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
        { firstName: 'Paul', lastName: 'Martin', email: 'paul@agence.fr', isPrimary: true },
      ],
      ...(over.sponsorOrg ?? {}),
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

/** Remplace le document par sa version « à ancres » — ce que fait un générateur. */
function regenere(cible: (d: DocRow) => boolean, suffixe = 'ancres') {
  const idx = docs.findIndex(cible);
  if (idx < 0) return;
  const ancien = docs[idx]!;
  docs[idx] = {
    ...ancien,
    id: `${ancien.id}-${suffixe}`,
    pdfUrl: `cle/${ancien.id}-${suffixe}.pdf`,
    hashSha256: `hash-${ancien.id}-${suffixe}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  auditLogCreate.mockResolvedValue({ id: 'audit-1' });

  // Les générateurs remplacent le document par sa version à ancres.
  conventionEntrepriseCoreMock.mockImplementation(async () => {
    regenere((d) => d.type === 'CONVENTION' && d.entityType === 'organization');
    return { ok: true, documentId: 'doc-conv-groupe-ancres' };
  });
  conventionCoreMock.mockImplementation(async () => {
    regenere((d) => d.type === 'CONVENTION' && d.entityType === 'participant');
    return { ok: true, documentId: 'doc-conv-ancres' };
  });
  ageficeMock.mockImplementation(async () => {
    regenere((d) => d.type === 'AGEFICE');
    return { ok: true, documentId: 'doc-agefice-ancres' };
  });
  assiduiteMock.mockImplementation(async () => {
    regenere((d) => d.type === 'ASSIDUITE');
    return { ok: true, documentId: 'doc-assiduite-ancres' };
  });
});

function sessionAvec(participants: unknown[]) {
  sessionFindFirst.mockResolvedValue({ id: SESSION_ID, code: 'SES-0010', participants });
}

describe('preparerEnvoiSignature — l’aperçu du PDF qui partira', () => {
  it('TNS via son EI : deux envois, régénérés à ancres, avec le hash de ce qui partira', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [
      doc({ id: 'doc-conv', type: 'CONVENTION', participantId: P_TNS, entityId: P_TNS }),
      doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS }),
    ];

    const r = await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'BEFORE' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envois.map((e) => e.cle)).toEqual(['CONVENTION:org-ei-1', 'AGEFICE:' + P_TNS]);

    const convention = r.envois[0]!;
    expect(convention.document).toEqual({
      documentId: 'doc-conv-ancres',
      pdfUrl: 'cle/doc-conv-ancres.pdf',
      hash: 'hash-doc-conv-ancres',
      regenere: true,
    });
    // Cascade EI_SELF : le « dirigeant » de son EI, c'est lui-même.
    expect(convention.signataire).toEqual({
      nom: 'Florent HAUSSWIRTH',
      email: 'florent@ei.fr',
      sourceNom: 'APPRENANT_EI_SELF',
      sourceEmail: 'PERSON',
    });
    expect(convention.empechements).toEqual([]);
  });

  it('la régénération passe `signatureTags: true` aux TROIS gabarits, sans branche par type', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [
      doc({ id: 'doc-conv', type: 'CONVENTION', participantId: P_TNS, entityId: P_TNS }),
      doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS }),
      doc({ id: 'doc-ass', type: 'ASSIDUITE', participantId: P_TNS, entityId: P_TNS }),
    ];

    await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'BEFORE' });
    await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'AFTER' });

    expect(conventionCoreMock).toHaveBeenCalledWith(
      TENANT_ID,
      P_TNS,
      expect.objectContaining({ signatureTags: true }),
    );
    expect(ageficeMock).toHaveBeenCalledWith(
      P_TNS,
      expect.objectContaining({ signatureTags: true }),
    );
    expect(assiduiteMock).toHaveBeenCalledWith(
      P_TNS,
      expect.objectContaining({ signatureTags: true }),
    );
  });

  it('journalise `document.regenerated_for_signature` avec l’ancien et le nouveau hash', async () => {
    sessionAvec([tnsViaSonEi()]);
    docs = [doc({ id: 'doc-age', type: 'AGEFICE', participantId: P_TNS, entityId: P_TNS })];

    await preparerEnvoiSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cles: ['AGEFICE:' + P_TNS],
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      tenantId: TENANT_ID,
      userId: USER_ID,
      entity: 'Document',
      entityId: 'doc-age-ancres',
      action: 'document.regenerated_for_signature',
    });
    expect(arg.data.diff).toMatchObject({
      cle: 'AGEFICE:' + P_TNS,
      docType: 'AGEFICE',
      hashSha256: { before: 'hash-doc-age', after: 'hash-doc-age-ancres' },
    });
  });

  it('un document DÉJÀ PARTI en signature n’est jamais régénéré — le régénérer l’effacerait', async () => {
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

    const r = await preparerEnvoiSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cles: ['AGEFICE:' + P_TNS],
    });

    expect(ageficeMock).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const envoi = r.envois[0]!;
    expect(envoi.empechements.map((e) => e.raison)).toEqual(['ENVOI_EN_COURS']);
    // Le message doit proposer les DEUX gestes : annuler, puis relancer. Un
    // refus qui ne dit qu'« impossible » fait recliquer sur le même bouton.
    expect(envoi.empechements[0]!.message).toMatch(/annul/i);
    expect(envoi.empechements[0]!.message).toMatch(/relanc/i);
    expect(envoi.document?.regenere).toBe(false);
  });

  it('un document DÉJÀ SIGNÉ n’est jamais régénéré non plus', async () => {
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

    const r = await preparerEnvoiSignature({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cles: ['AGEFICE:' + P_TNS],
    });

    expect(ageficeMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envois[0]!.empechements.map((e) => e.raison)).toEqual(['DEJA_SIGNE']);
  });

  it('salarié OPCO : la convention de l’agence est signée par son dirigeant, pas par la salariée', async () => {
    sessionAvec([salarieAgence()]);
    docs = [
      doc({
        id: 'doc-conv-grp',
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: 'org-agence',
        participantId: null,
      }),
    ];

    const r = await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'BEFORE' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envois.map((e) => e.cle)).toEqual(['CONVENTION:org-agence']);
    expect(r.envois[0]!.signataire).toEqual({
      nom: 'Paul MARTIN',
      email: 'paul@agence.fr',
      sourceNom: 'ORG_REPRESENTATIVE',
      sourceEmail: 'CONTACT_NOMME',
    });
    expect(conventionEntrepriseCoreMock).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      'org-agence',
      null,
      expect.objectContaining({ signatureTags: true }),
    );
  });

  it('signataire sans email : l’aperçu existe QUAND MÊME, avec son hash et l’empêchement nommé', async () => {
    sessionAvec([
      salarieAgence({
        sponsorOrg: {
          id: 'org-agence',
          legalName: 'AGENCE MARTIN',
          brandName: null,
          legalForm: 'SARL',
          representative: 'Paul MARTIN',
          opcoCode: 'OPCO_EP',
          contacts: [
            // Un AUTRE contact a bien un email : il ne doit servir à rien.
            {
              firstName: 'Sophie',
              lastName: 'Bernard',
              email: 'sophie@agence.fr',
              isPrimary: false,
            },
          ],
        },
      }),
    ]);
    docs = [
      doc({
        id: 'doc-conv-grp',
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: 'org-agence',
        participantId: null,
      }),
    ];

    const r = await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'BEFORE' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const envoi = r.envois[0]!;
    // Le hash EST là : c'est lui que C.2b affichera, et que l'envoi confirmera.
    expect(envoi.document?.hash).toBe('hash-doc-conv-grp-ancres');
    expect(envoi.signataire).toBeNull();
    expect(envoi.empechements.map((e) => e.raison)).toEqual(['SIGNATAIRE_SANS_EMAIL']);
    const message = envoi.empechements[0]!.message;
    expect(message).toContain('Paul MARTIN');
    expect(message).toContain('AGENCE MARTIN');
    // L'adresse du tiers n'apparaît nulle part : elle n'est pas une solution.
    expect(message).not.toContain('sophie@agence.fr');
  });

  it('session d’un autre tenant : refus global, aucun document lu, aucune régénération', async () => {
    sessionFindFirst.mockResolvedValue(null);

    const r = await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'BEFORE' });

    expect(r).toEqual({ ok: false, error: expect.stringContaining('session') });
    expect(documentFindFirst).not.toHaveBeenCalled();
    expect(conventionEntrepriseCoreMock).not.toHaveBeenCalled();
  });

  it('rôle insuffisant : refus global sans lire la session', async () => {
    const { ForbiddenError } = await import('@/lib/rbac');
    requireRoleMock.mockRejectedValue(new ForbiddenError('Accès refusé'));

    const r = await preparerEnvoiSignature({ sessionId: SESSION_ID, scope: 'BEFORE' });

    expect(r.ok).toBe(false);
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });

  it('entrée invalide : refus global avant tout I/O', async () => {
    const r = await preparerEnvoiSignature({ sessionId: 'pas-un-uuid', scope: 'BEFORE' });

    expect(r.ok).toBe(false);
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });
});
