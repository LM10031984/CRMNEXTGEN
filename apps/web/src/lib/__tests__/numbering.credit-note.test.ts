// Wave 0 stub — Phase 11 — implemented in Plan 11-01
import { describe, it } from 'vitest';

describe('getNextCreditNoteNumber', () => {
  it.todo('returns AVO-000001 quand aucun avoir existe');
  it.todo('returns AVO-000042 quand dernier avoir est AVO-000041');
  it.todo('respecte le préfixe custom tenant.creditNotePrefix');
  it.todo('fallback AVO si tenant.creditNotePrefix null');
  it.todo('utilise le tx Prisma quand fourni (atomicité)');
  it.todo("filtre uniquement les Invoice avec number startsWith AVO- (n'inclut pas les FAC-)");
});
