import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Date de délivrance de l'ATTESTATION D'ASSIDUITÉ AGEFICE.
 *
 * LA RÈGLE : l'attestation est datée du DERNIER JOUR DE LA FORMATION, jamais
 * du jour où on l'édite. Constat de Laurent le 21/09/2026 : la signature de
 * l'OF portait la date d'émission, si bien qu'une assiduité éditée le 21/09
 * pour une formation terminée le 11/06 attestait d'une assiduité… trois mois
 * après les faits. Rééditer le même document le lendemain en changeait la
 * date : deux pièces contradictoires pour un même dossier, au moment précis où
 * l'AGEFICE compare l'attestation aux dates de la convention.
 *
 * Le modèle de référence tranche dans le même sens : l'attestation Kristin
 * KING (formation du 01/06 au 11/06/2026) porte « Le : 11/06/2026 ».
 *
 * MÊME RÈGLE, MÊME MOTIF QU'AILLEURS : `attestation-template.ts` et
 * `certificat-template.ts` datent déjà de `sessionEndDate` en s'interdisant
 * explicitement la date de génération — « sinon une régénération a posteriori
 * daterait l'attestation du jour, marqueur visible en audit ». L'assiduité
 * était la dernière pièce signée à rester sur l'horloge.
 *
 * Test de puissance : remettre `dateDelivrance: new Date()` dans le
 * générateur fait virer les deux premiers tests au ROUGE.
 */

const findFirstParticipant = vi.fn();

vi.mock('@qualiof/db', () => ({
  prisma: {
    document: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    sessionParticipant: { findFirst: (...a: unknown[]) => findFirstParticipant(...a) },
  },
}));

vi.mock('@/lib/auth', () => ({
  validateRequest: vi.fn().mockResolvedValue({ user: { tenantId: 'tnt-1', id: 'u-1' } }),
}));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    rnq: '93 06 10481 06',
    addressVille: 'Cagnes-sur-Mer',
    resp: { prenom: 'Laurent', nom: 'MARX', titre: 'PDG' },
  }),
}));

const renderAgeficeAttendanceHtml = vi.fn().mockReturnValue('<html></html>');
vi.mock('@/lib/closure/agefice-attendance-template', () => ({
  renderAgeficeAttendanceHtml: (d: unknown) => renderAgeficeAttendanceHtml(d),
}));

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

vi.mock('@/lib/docs/document-source', () => ({
  computeDocumentFingerprint: vi.fn().mockResolvedValue(null),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { generateAgeficeAttendanceForParticipant } from '../agefice-attendance-generator';

const FIN_DE_FORMATION = new Date('2026-06-11T00:00:00.000Z');

/** Inscription minimale : une EI AGEFICE, un prix, un produit, une session close. */
function participant(session?: { startDate?: Date; endDate?: Date }) {
  return {
    id: 'part-1',
    priceHT: 3024,
    sponsorOrg: {
      id: 'org-ei',
      legalName: 'KING Kristin EI',
      legalForm: 'EI',
      opcoCode: 'AGEFICE',
    },
    person: {
      id: 'p-1',
      firstName: 'Kristin',
      lastName: 'KING',
      civility: 'Mme',
      legalLinks: [],
    },
    session: {
      id: 'ses-1',
      code: 'SES-0042',
      name: 'IA immobilier (72h)',
      modality: 'PRESENTIEL',
      startDate: session?.startDate ?? new Date('2026-06-01T00:00:00.000Z'),
      endDate: session?.endDate ?? FIN_DE_FORMATION,
      product: { title: 'IA immobilier', durationHours: 72, priceHT: 3024 },
      trainers: [],
      _count: { participants: 1 },
    },
  };
}

/** La date réellement imprimée sous « Fait à …, Le : … ». */
function dateSignee(): Date | undefined {
  const data = renderAgeficeAttendanceHtml.mock.calls.at(-1)?.[0] as
    | { dateDelivrance?: Date }
    | undefined;
  return data?.dateDelivrance;
}

beforeEach(() => {
  renderAgeficeAttendanceHtml.mockClear();
  findFirstParticipant.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("attestation d'assiduité — date de délivrance", () => {
  it('porte la date de fin de formation, pas celle du jour où on l’édite', async () => {
    // Éditée trois mois après la fin : l'horloge ne doit rien changer au PDF.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T10:00:00.000Z'));
    findFirstParticipant.mockResolvedValue(participant());

    await generateAgeficeAttendanceForParticipant('part-1');

    expect(dateSignee()).toEqual(FIN_DE_FORMATION);
  });

  it('rééditée un autre jour, elle porte toujours la même date', async () => {
    findFirstParticipant.mockResolvedValue(participant());

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T10:00:00.000Z'));
    await generateAgeficeAttendanceForParticipant('part-1');
    const premiere = dateSignee();

    vi.setSystemTime(new Date('2026-12-02T09:00:00.000Z'));
    await generateAgeficeAttendanceForParticipant('part-1');

    // Deux éditions, une seule date : c'est ce que l'AGEFICE compare à la convention.
    expect(dateSignee()).toEqual(premiere);
  });

  it("d'une formation encore à venir, elle est datée de sa fin — jamais du jour d'édition", async () => {
    // Éditée par anticipation : la pièce ne peut pas attester d'une assiduité
    // avant le dernier jour, elle porte donc la date de fin prévue.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T10:00:00.000Z'));
    const fin = new Date('2026-11-20T00:00:00.000Z');
    findFirstParticipant.mockResolvedValue(
      participant({ startDate: new Date('2026-11-09T00:00:00.000Z'), endDate: fin }),
    );

    await generateAgeficeAttendanceForParticipant('part-1');

    expect(dateSignee()).toEqual(fin);
  });

  it('date de règlement et date de délivrance restent cohérentes', async () => {
    findFirstParticipant.mockResolvedValue(participant());

    await generateAgeficeAttendanceForParticipant('part-1');

    const data = renderAgeficeAttendanceHtml.mock.calls.at(-1)?.[0] as {
      dateReglement?: Date;
      formationDateFin?: Date;
    };
    expect(data.formationDateFin).toEqual(FIN_DE_FORMATION);
    expect(data.dateReglement).toEqual(FIN_DE_FORMATION);
  });
});
