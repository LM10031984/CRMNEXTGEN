import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 20 Plan 20-02 Task 2 — driver de poll OCR `processNextPreEnrollmentOcr`.
 *
 * Stratégie de mock (pattern repo via vi.hoisted) :
 *  - `@qualiof/db`               → prisma.$queryRaw (claim atomique) + preEnrollment.update (filet D-06).
 *  - `../preinscription-extractor` → extractPreEnrollmentDocuments mocké (cœur OCR).
 *  - `@qualiof/shared/env`       → no-op (le module n'importe pas l'env, mais le worker oui).
 *
 * Aucun accès réel à Postgres ni au pipeline OCR (tout mocké).
 *
 * Coverage (acceptance) :
 *  (1) 2 rows claimés → extract appelé 2× (a puis b), { processed:2, succeeded:2, failed:0 }.
 *  (2) 0 row claimé → { processed:0, ... }, extract JAMAIS appelé.
 *  (3) D-06 anti-dégradation : extract throw → preEnrollment.update(status:'SUBMITTED', aiErrorMsg non vide), failed>=1.
 */

const { queryRaw, peUpdate, extractPreEnrollmentDocuments } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  peUpdate: vi.fn(),
  extractPreEnrollmentDocuments: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    $queryRaw: queryRaw,
    preEnrollment: { update: peUpdate },
  },
}));

vi.mock('../preinscription-extractor', () => ({ extractPreEnrollmentDocuments }));

import { processNextPreEnrollmentOcr } from '../preinscription-ocr-queue';

beforeEach(() => {
  vi.clearAllMocks();
  peUpdate.mockResolvedValue({});
});

describe('processNextPreEnrollmentOcr', () => {
  it('claim 2 rows → extract appelé 2× dans l’ordre, processed=2 succeeded=2', async () => {
    queryRaw.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    extractPreEnrollmentDocuments.mockResolvedValue(undefined);

    const r = await processNextPreEnrollmentOcr(3);

    expect(extractPreEnrollmentDocuments).toHaveBeenCalledTimes(2);
    expect(extractPreEnrollmentDocuments).toHaveBeenNthCalledWith(1, 'a');
    expect(extractPreEnrollmentDocuments).toHaveBeenNthCalledWith(2, 'b');
    expect(r).toEqual({ processed: 2, succeeded: 2, failed: 0 });
  });

  it('0 row claimé → processed=0, extract jamais appelé', async () => {
    queryRaw.mockResolvedValueOnce([]);

    const r = await processNextPreEnrollmentOcr(3);

    expect(extractPreEnrollmentDocuments).not.toHaveBeenCalled();
    expect(r).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });

  it('D-06 : extract throw → repasse SUBMITTED + aiErrorMsg non vide, failed>=1', async () => {
    queryRaw.mockResolvedValueOnce([{ id: 'boom' }]);
    extractPreEnrollmentDocuments.mockRejectedValueOnce(new Error('pdftoppm crash'));

    const r = await processNextPreEnrollmentOcr(1);

    expect(peUpdate).toHaveBeenCalledTimes(1);
    const arg = peUpdate.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: 'boom' });
    expect(arg.data.status).toBe('SUBMITTED');
    expect(arg.data.aiErrorMsg).toBeTruthy();
    expect(arg.data.aiErrorMsg.length).toBeGreaterThan(0);
    expect(r.failed).toBeGreaterThanOrEqual(1);
  });
});
