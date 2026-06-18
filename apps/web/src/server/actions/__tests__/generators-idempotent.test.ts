import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260618-a24 Task 2 — deleteMany Document inconditionnelle dans les 4 generators.
 *
 * Vérifie que chaque generator (convention / convocation / agefice /
 * agefice-attendance) appelle `prisma.document.deleteMany` AVANT de générer,
 * MÊME SANS `force` (anti-doublons). Le where (tenantId + type + participantId)
 * scelle le bon type de document.
 *
 * Stratégie : `findFirst` renvoie null → le generator supprime puis retourne
 * `{ ok: false, error: 'Inscription introuvable' }`. L'essentiel est que la
 * suppression a déjà eu lieu, sans avoir passé `force`.
 *
 * Test de puissance (consigne Laurent) : remettre `if (options?.force)` autour
 * du deleteMany fait virer le test correspondant ROUGE (deleteMany non appelé
 * en mode par défaut).
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    document: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    sessionParticipant: {
      // null → court-circuite chaque generator après le deleteMany.
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ageficePointAccueil: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock('@/lib/auth', () => ({
  validateRequest: vi.fn().mockResolvedValue({ user: { tenantId: 'tnt-1', id: 'u-1' } }),
}));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdfWeasy: vi.fn().mockResolvedValue(Buffer.from('x')),
  renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('x')),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/convention-template', () => ({
  renderConventionHtml: vi.fn().mockReturnValue('<html></html>'),
}));

vi.mock('@/lib/convocation-template', () => ({
  renderConvocationHtml: vi.fn().mockReturnValue('<html></html>'),
}));

vi.mock('@/lib/agefice-form-fill', () => ({
  fillAgeficePdf: vi.fn().mockResolvedValue(Buffer.from('x')),
}));

vi.mock('@/lib/agefice-options', () => ({
  isCanonicalExperience: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/pedagogy-templates', () => ({
  buildDeroulementPedagogique: vi.fn().mockReturnValue(''),
}));

vi.mock('@/lib/closure/agefice-attendance-template', () => ({
  renderAgeficeAttendanceHtml: vi.fn().mockReturnValue('<html></html>'),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { generateConventionForParticipant } from '../convention-generator';
import { generateConvocationForParticipant } from '../convocation-generator';
import { generateAgeficeForParticipant } from '../agefice-generator';
import { generateAgeficeAttendanceForParticipant } from '../agefice-attendance-generator';

const documentDeleteMany = prisma.document.deleteMany as unknown as ReturnType<typeof vi.fn>;

const PARTICIPANT_ID = 'part-1';
const TENANT_ID = 'tnt-1';

beforeEach(() => {
  documentDeleteMany.mockClear();
});

describe('generators — deleteMany Document inconditionnelle (Task 2)', () => {
  it("Test 1 — generateConventionForParticipant SANS options (force unset) → deleteMany CONVENTION", async () => {
    await generateConventionForParticipant(PARTICIPANT_ID);

    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, type: 'CONVENTION', participantId: PARTICIPANT_ID },
    });
  });

  it("Test 2 — generateConvocationForParticipant SANS options → deleteMany CONVOCATION", async () => {
    await generateConvocationForParticipant(PARTICIPANT_ID);

    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, type: 'CONVOCATION', participantId: PARTICIPANT_ID },
    });
  });

  it("Test 3 — generateAgeficeForParticipant SANS options → deleteMany AGEFICE", async () => {
    await generateAgeficeForParticipant(PARTICIPANT_ID);

    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, type: 'AGEFICE', participantId: PARTICIPANT_ID },
    });
  });

  it("Test 4 — generateAgeficeAttendanceForParticipant SANS options → deleteMany ASSIDUITE", async () => {
    await generateAgeficeAttendanceForParticipant(PARTICIPANT_ID);

    expect(documentDeleteMany).toHaveBeenCalledTimes(1);
    expect(documentDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, type: 'ASSIDUITE', participantId: PARTICIPANT_ID },
    });
  });
});
