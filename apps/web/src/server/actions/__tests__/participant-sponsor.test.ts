import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `changerFinanceurInscription` + `listerFinanceursPossibles` — lot C.2b-5.
 *
 * CE QUE CE FICHIER GARDE. Quatre promesses, et chacune a été vérifiée par
 * MUTATION (sur ce chantier, sept tests écrits en relecture ne gardaient rien) :
 *
 *  1. REFUS si un `OpcoSubmission` est déjà parti (SENT / ACK_RECEIVED /
 *     APPROVED / REIMBURSED) — et AUTORISATION si DRAFT / REJECTED / CANCELED.
 *  2. REFUS si une pièce est signée (`signedPdfUrl` non nul ou `status=signed`).
 *  3. L'`AuditLog` est écrit DANS la transaction — donc via le `tx`, jamais via
 *     le client global. Le test assert les DEUX : `tx.auditLog.create` appelé,
 *     `prisma.auditLog.create` JAMAIS. Sortir l'audit de la transaction casse
 *     la seconde assertion, même si la première reste verte.
 *  4. TOUT est scopé `tenantId` — la liste proposée ET l'organisation cible.
 *     Une inscription ne peut pas être rattachée à l'organisation d'un autre
 *     tenant, et la liste ne propose jamais celle d'un voisin.
 *
 * Harness de mock : clone du patron `update-session-details.test.ts` (client
 * `@qualiof/db` entièrement mocké) + le patron `tx` de
 * `signature-annulation.test.ts` pour les écritures transactionnelles.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    organization: { findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {
    Decimal: class {
      constructor(public v: number | string) {}
    },
    JsonNull: null,
  },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: vi.fn() };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import {
  changerFinanceurInscription,
  listerFinanceursPossibles,
} from '../participant-sponsor';

const participantFindUnique = prisma.sessionParticipant.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const orgFindFirst = prisma.organization.findFirst as unknown as ReturnType<typeof vi.fn>;
const orgFindMany = prisma.organization.findMany as unknown as ReturnType<typeof vi.fn>;
const auditCreateGlobal = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const transactionMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const revalidatePathMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;

/** Les écritures réellement passées par le `tx` de la transaction. */
const ecrituresTx = {
  participantUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
};

const TENANT = 'tenant-start-academy';
const AUTRE_TENANT = 'tenant-voisin';
const PARTICIPANT_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const ANCIEN_ORG_ID = '33333333-3333-3333-3333-333333333333';
const NOUVEL_ORG_ID = '44444444-4444-4444-4444-444444444444';

const ADMIN = { id: 'user-1', tenantId: TENANT, email: 'laurent@start-academy.fr', role: 'ADMIN' };

function inscription(over: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANT_ID,
    sponsorOrgId: ANCIEN_ORG_ID,
    sponsorOrg: { id: ANCIEN_ORG_ID, legalName: 'MARION DELAUNAY EI', brandName: null },
    person: { id: 'pers-1', firstName: 'Marion', lastName: 'Delaunay' },
    session: { id: SESSION_ID, tenantId: TENANT },
    opcoSubmissions: [],
    agreementDocs: [],
    ...over,
  };
}

function orgCible(over: Record<string, unknown> = {}) {
  return {
    id: NOUVEL_ORG_ID,
    legalName: 'SIGMA IMMOBILIER',
    brandName: 'Sigma',
    opcoCode: 'OPCO_EP',
    archived: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN);
  participantFindUnique.mockResolvedValue(inscription());
  orgFindFirst.mockResolvedValue(orgCible());
  orgFindMany.mockResolvedValue([]);
  ecrituresTx.participantUpdate.mockResolvedValue({ id: PARTICIPANT_ID });
  ecrituresTx.auditLogCreate.mockResolvedValue({ id: 'audit-1' });
  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      sessionParticipant: { update: ecrituresTx.participantUpdate },
      auditLog: { create: ecrituresTx.auditLogCreate },
    }),
  );
});

function changer(over: Partial<{ participantId: string; sponsorOrgId: string }> = {}) {
  return changerFinanceurInscription({
    participantId: PARTICIPANT_ID,
    sponsorOrgId: NOUVEL_ORG_ID,
    ...over,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('changerFinanceurInscription — chemin nominal', () => {
  it('rattache l’inscription au nouveau financeur ET écrit l’audit DANS la transaction', async () => {
    const r = await changer();

    expect(r).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);

    expect(ecrituresTx.participantUpdate).toHaveBeenCalledTimes(1);
    const update = ecrituresTx.participantUpdate.mock.calls[0]![0];
    expect(update.where).toEqual({ id: PARTICIPANT_ID });
    expect(update.data.sponsorOrgId ?? update.data.sponsorOrg?.connect?.id).toBe(NOUVEL_ORG_ID);

    expect(ecrituresTx.auditLogCreate).toHaveBeenCalledTimes(1);
    // ⚠ L'assertion qui tue la mutation « sortir l'AuditLog de la transaction » :
    // si l'audit passe par le client global, il n'est plus couvert par le
    // rollback, et cette ligne devient fausse.
    expect(auditCreateGlobal).not.toHaveBeenCalled();
  });

  it('l’AuditLog porte l’action dédiée, le tenant, l’auteur — et les DEUX sponsors NOMMÉS', async () => {
    await changer();

    const audit = ecrituresTx.auditLogCreate.mock.calls[0]![0].data;
    expect(audit.action).toBe('participant.sponsor_changed');
    expect(audit.entity).toBe('SessionParticipant');
    expect(audit.entityId).toBe(PARTICIPANT_ID);
    expect(audit.tenantId).toBe(TENANT);
    expect(audit.userId).toBe(ADMIN.id);

    // Pas seulement des ids : un audit qui ne stocke que des UUID est illisible
    // six mois plus tard, quand l'organisation a été renommée ou fusionnée.
    expect(audit.diff.before).toMatchObject({
      sponsorOrgId: ANCIEN_ORG_ID,
      sponsorOrgLabel: 'MARION DELAUNAY EI',
    });
    expect(audit.diff.after).toMatchObject({
      sponsorOrgId: NOUVEL_ORG_ID,
      sponsorOrgLabel: 'Sigma',
    });
    expect(JSON.stringify(audit.diff)).toContain('Marion DELAUNAY');
  });

  it('revalide la fiche session', async () => {
    await changer();
    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/sessions/${SESSION_ID}`);
  });

  it('même financeur → no-op : ni écriture, ni AuditLog', async () => {
    const r = await changer({ sponsorOrgId: ANCIEN_ORG_ID });
    expect(r).toEqual({ ok: true });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(ecrituresTx.auditLogCreate).not.toHaveBeenCalled();
  });
});

describe('changerFinanceurInscription — REFUS 1 : dossier déjà parti chez le financeur', () => {
  it.each(['SENT', 'ACK_RECEIVED', 'APPROVED', 'REIMBURSED'])(
    'statut %s → refus, rien n’est écrit',
    async (statut) => {
      participantFindUnique.mockResolvedValue(
        inscription({
          opcoSubmissions: [
            {
              id: 'sub-1',
              status: statut,
              sponsorOrg: { legalName: 'AGEFICE', brandName: 'AGEFICE Grand Est' },
            },
          ],
        }),
      );

      const r = await changer();

      expect(r.ok).toBe(false);
      expect(transactionMock).not.toHaveBeenCalled();
      expect(ecrituresTx.participantUpdate).not.toHaveBeenCalled();
    },
  );

  it('le refus est NOMINATIF : il nomme l’apprenant, le financeur et le statut', async () => {
    participantFindUnique.mockResolvedValue(
      inscription({
        opcoSubmissions: [
          {
            id: 'sub-1',
            status: 'APPROVED',
            sponsorOrg: { legalName: 'AGEFICE', brandName: 'AGEFICE Grand Est' },
          },
        ],
      }),
    );

    const r = await changer();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inatteignable');
    expect(r.error).toContain('Marion DELAUNAY');
    expect(r.error).toContain('AGEFICE Grand Est');
    expect(r.error).toContain('accord de prise en charge reçu');
  });

  it.each(['DRAFT', 'REJECTED', 'CANCELED'])(
    'PUISSANCE — statut %s n’interdit RIEN : le re-rattachement passe',
    async (statut) => {
      participantFindUnique.mockResolvedValue(
        inscription({
          opcoSubmissions: [
            { id: 'sub-1', status: statut, sponsorOrg: { legalName: 'AGEFICE', brandName: null } },
          ],
        }),
      );

      const r = await changer();

      expect(r).toEqual({ ok: true });
      expect(ecrituresTx.participantUpdate).toHaveBeenCalledTimes(1);
    },
  );
});

describe('changerFinanceurInscription — REFUS 2 : pièce signée', () => {
  it('signedPdfUrl non nul → refus nominatif qui nomme la pièce', async () => {
    participantFindUnique.mockResolvedValue(
      inscription({
        agreementDocs: [
          {
            id: 'doc-1',
            type: 'CONVENTION',
            status: 'signed',
            signedPdfUrl: 'tenant/convention-signee.pdf',
          },
        ],
      }),
    );

    const r = await changer();

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inatteignable');
    expect(r.error).toContain('Marion DELAUNAY');
    expect(r.error).toContain('Convention de formation');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("status = 'signed' sans PDF stocké → refus quand même", async () => {
    participantFindUnique.mockResolvedValue(
      inscription({
        agreementDocs: [
          { id: 'doc-1', type: 'AGEFICE', status: 'signed', signedPdfUrl: null },
        ],
      }),
    );

    const r = await changer();
    expect(r.ok).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('PUISSANCE — une pièce seulement générée n’interdit rien', async () => {
    participantFindUnique.mockResolvedValue(
      inscription({
        agreementDocs: [
          { id: 'doc-1', type: 'CONVENTION', status: 'generated', signedPdfUrl: null },
        ],
      }),
    );

    const r = await changer();
    expect(r).toEqual({ ok: true });
    expect(ecrituresTx.participantUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('changerFinanceurInscription — cloisonnement tenant', () => {
  it('l’inscription d’un autre tenant est introuvable, point', async () => {
    participantFindUnique.mockResolvedValue(
      inscription({ session: { id: SESSION_ID, tenantId: AUTRE_TENANT } }),
    );

    const r = await changer();

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inatteignable');
    expect(r.error).toContain('introuvable');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('l’organisation cible est cherchée AVEC le tenantId — sinon on rattacherait chez le voisin', async () => {
    await changer();

    expect(orgFindFirst).toHaveBeenCalledTimes(1);
    const where = orgFindFirst.mock.calls[0]![0].where;
    expect(where.id).toBe(NOUVEL_ORG_ID);
    expect(where.tenantId).toBe(TENANT);
  });

  it('PUISSANCE — organisation d’un autre tenant (donc non trouvée) → refus nominatif, rien écrit', async () => {
    orgFindFirst.mockResolvedValue(null);

    const r = await changer();

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inatteignable');
    expect(r.error).toContain('Marion DELAUNAY');
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('changerFinanceurInscription — RBAC et validation', () => {
  it('un rôle refusé ne passe pas et ne lève pas : message rendu à l’écran', async () => {
    requireRoleMock.mockRejectedValue(new ForbiddenError('Accès refusé'));

    const r = await changer();

    expect(r.ok).toBe(false);
    expect(participantFindUnique).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('exige ADMIN ou MANAGER — pas COMMERCIAL', async () => {
    await changer();
    expect(requireRoleMock).toHaveBeenCalledWith(['ADMIN', 'MANAGER']);
  });

  it('participantId non-UUID → refus Zod, aucune requête', async () => {
    const r = await changer({ participantId: 'pas-un-uuid' });

    expect(r.ok).toBe(false);
    expect(participantFindUnique).not.toHaveBeenCalled();
  });

  it('sponsorOrgId non-UUID → refus Zod, aucune requête', async () => {
    const r = await changer({ sponsorOrgId: '' });

    expect(r.ok).toBe(false);
    expect(participantFindUnique).not.toHaveBeenCalled();
  });
});

describe('listerFinanceursPossibles — la liste proposée est cloisonnée', () => {
  it('sans recherche : findMany scopé tenantId, archivées exclues, plafonné', async () => {
    orgFindMany.mockResolvedValue([orgCible()]);

    const r = await listerFinanceursPossibles();

    expect(r.ok).toBe(true);
    const args = orgFindMany.mock.calls[0]![0];
    expect(args.where.tenantId).toBe(TENANT);
    expect(args.where.archived).toBe(false);
    expect(args.take).toBeLessThanOrEqual(50);
  });

  it('PUISSANCE — avec recherche, le tenantId reste posé (le OR ne doit pas l’avaler)', async () => {
    orgFindMany.mockResolvedValue([]);

    await listerFinanceursPossibles({ q: 'sigma' });

    const args = orgFindMany.mock.calls[0]![0];
    expect(args.where.tenantId).toBe(TENANT);
    expect(JSON.stringify(args.where)).toContain('sigma');
  });

  it('rend un libellé lisible (enseigne si elle existe) + le code financeur', async () => {
    orgFindMany.mockResolvedValue([
      orgCible(),
      orgCible({ id: 'org-3', legalName: 'MARION DELAUNAY EI', brandName: null, opcoCode: 'AGEFICE' }),
    ]);

    const r = await listerFinanceursPossibles();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.financeurs[0]).toMatchObject({ id: NOUVEL_ORG_ID, label: 'Sigma', opcoCode: 'OPCO_EP' });
    expect(r.financeurs[1]).toMatchObject({ label: 'MARION DELAUNAY EI', opcoCode: 'AGEFICE' });
  });

  it('un rôle refusé ne liste rien', async () => {
    requireRoleMock.mockRejectedValue(new ForbiddenError('Accès refusé'));

    const r = await listerFinanceursPossibles();

    expect(r.ok).toBe(false);
    expect(orgFindMany).not.toHaveBeenCalled();
  });
});

describe('listerFinanceursPossibles — le financeur ACTUEL de l’inscription', () => {
  it('remonte l’id du sponsor courant quand `participantId` est fourni', async () => {
    orgFindMany.mockResolvedValue([
      orgCible({ id: ANCIEN_ORG_ID, legalName: 'MARION DELAUNAY EI', brandName: null }),
    ]);
    participantFindUnique.mockResolvedValue({
      sponsorOrgId: ANCIEN_ORG_ID,
      session: { tenantId: TENANT },
    });

    const r = await listerFinanceursPossibles({ participantId: PARTICIPANT_ID });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.financeurActuelId).toBe(ANCIEN_ORG_ID);
  });

  it('PUISSANCE — financeur courant hors de la liste (plafond/recherche) : il est RAJOUTÉ', async () => {
    // La liste ne contient QUE d'autres organisations…
    orgFindMany.mockResolvedValue([orgCible()]);
    participantFindUnique.mockResolvedValue({
      sponsorOrgId: ANCIEN_ORG_ID,
      session: { tenantId: TENANT },
    });
    orgFindFirst.mockResolvedValue(
      orgCible({ id: ANCIEN_ORG_ID, legalName: 'MARION DELAUNAY EI', brandName: null }),
    );

    const r = await listerFinanceursPossibles({ participantId: PARTICIPANT_ID, q: 'sigma' });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    // …sinon le sélecteur s'ouvrirait sur « aucun financeur » pour une
    // inscription qui en a un.
    expect(r.financeurs.map((f) => f.id)).toContain(ANCIEN_ORG_ID);
    // Et la relecture du courant est elle aussi scopée tenant.
    expect(orgFindFirst.mock.calls[0]![0].where.tenantId).toBe(TENANT);
  });

  it('inscription d’un autre tenant → aucun financeur courant, aucune fuite', async () => {
    orgFindMany.mockResolvedValue([orgCible()]);
    participantFindUnique.mockResolvedValue({
      sponsorOrgId: ANCIEN_ORG_ID,
      session: { tenantId: AUTRE_TENANT },
    });

    const r = await listerFinanceursPossibles({ participantId: PARTICIPANT_ID });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inatteignable');
    expect(r.financeurActuelId).toBeNull();
    expect(r.financeurs.map((f) => f.id)).not.toContain(ANCIEN_ORG_ID);
  });
});
