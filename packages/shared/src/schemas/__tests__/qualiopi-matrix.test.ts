import { describe, it, expect } from 'vitest';
import {
  DocStatusState,
  DocStatusEntrySchema,
  DocStatusMapSchema,
} from '../qualiopi-matrix';

/**
 * Tests Phase 9.1 Plan 09.1-01 Task 1 — schémas Zod `qualiopi-matrix`.
 *
 * Coverage (cf. <behavior> du PLAN.md) :
 *  - Test 1 : DocStatusState.parse('GENERATED')
 *  - Test 2 : DocStatusState.parse('INVALID') → ZodError
 *  - Test 3 : DocStatusEntrySchema accepte le cas nominal MANUAL_OK avec uploadedSignedPdfKey
 *  - Test 4 : DocStatusEntrySchema accepte le cas dérogatoire D-01 markedOkWithoutUpload
 *  - Test 5 : DocStatusMapSchema accepte un map à plusieurs entrées
 *  - Test 6 : DocStatusEntrySchema rejette note > 500 chars
 */

describe('DocStatusState (Phase 9.1 D-03)', () => {
  it('Test 1 — parse("GENERATED") retourne "GENERATED"', () => {
    expect(DocStatusState.parse('GENERATED')).toBe('GENERATED');
  });

  it('Test 2 — parse("INVALID") lève une ZodError', () => {
    expect(() => DocStatusState.parse('INVALID')).toThrow();
    const result = DocStatusState.safeParse('INVALID');
    expect(result.success).toBe(false);
  });

  it('accepte les 3 valeurs MANUAL_OK / GENERATED / MISSING (D-03 grain figé)', () => {
    expect(DocStatusState.parse('MANUAL_OK')).toBe('MANUAL_OK');
    expect(DocStatusState.parse('GENERATED')).toBe('GENERATED');
    expect(DocStatusState.parse('MISSING')).toBe('MISSING');
  });
});

describe('DocStatusEntrySchema', () => {
  it('Test 3 — accepte un MANUAL_OK avec uploadedSignedPdfKey + uploadedSignedAt + updatedAt', () => {
    const parsed = DocStatusEntrySchema.parse({
      state: 'MANUAL_OK',
      uploadedSignedPdfKey: 'signed/tenant1/SES-001/abc.pdf',
      uploadedSignedAt: '2026-05-18T10:00:00.000Z',
      updatedAt: '2026-05-18T10:00:00.000Z',
    });
    expect(parsed.state).toBe('MANUAL_OK');
    expect(parsed.uploadedSignedPdfKey).toBe('signed/tenant1/SES-001/abc.pdf');
  });

  it('Test 4 — accepte le cas dérogatoire D-01 (markedOkWithoutUpload + note)', () => {
    const parsed = DocStatusEntrySchema.parse({
      state: 'MANUAL_OK',
      markedOkWithoutUpload: true,
      note: 'Justif dérog',
      updatedAt: '2026-05-18T10:00:00.000Z',
    });
    expect(parsed.markedOkWithoutUpload).toBe(true);
    expect(parsed.note).toBe('Justif dérog');
  });

  it('Test 6 — rejette une note > 500 chars', () => {
    const result = DocStatusEntrySchema.safeParse({
      state: 'MANUAL_OK',
      note: 'a'.repeat(501),
      updatedAt: '2026-05-18T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.note).toBeDefined();
    }
  });

  it('rejette un updatedAt manquant (champ requis)', () => {
    const result = DocStatusEntrySchema.safeParse({ state: 'GENERATED' });
    expect(result.success).toBe(false);
  });

  it('rejette un uploadedByUserId non-UUID', () => {
    const result = DocStatusEntrySchema.safeParse({
      state: 'MANUAL_OK',
      uploadedByUserId: 'not-a-uuid',
      updatedAt: '2026-05-18T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('DocStatusMapSchema', () => {
  it('Test 5 — accepte un map { PROGRAMME, CONVENTION }', () => {
    const parsed = DocStatusMapSchema.parse({
      PROGRAMME: { state: 'GENERATED', updatedAt: '2026-05-18T10:00:00.000Z' },
      CONVENTION: {
        state: 'MANUAL_OK',
        uploadedSignedPdfKey: 'signed/x.pdf',
        uploadedSignedAt: '2026-05-18T10:00:00.000Z',
        updatedAt: '2026-05-18T10:00:00.000Z',
      },
    });
    expect(parsed.PROGRAMME?.state).toBe('GENERATED');
    expect(parsed.CONVENTION?.state).toBe('MANUAL_OK');
  });

  it('accepte un map vide (cas initial — aucun statut manuel posé)', () => {
    const parsed = DocStatusMapSchema.parse({});
    expect(parsed).toEqual({});
  });
});
