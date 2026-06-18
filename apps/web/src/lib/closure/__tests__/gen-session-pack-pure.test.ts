import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260618-gux Task 3 — tests purs du pipeline _gen-session-pack.
 *
 *  - Gate froid : isFroidEligible + filtrage des kinds (SATISFACTION_FROID).
 *  - Helpers Drive : sanitize, formatDateFR, buildSessionPaths (racine vs apprenant,
 *    idempotence des chemins).
 *  - Idempotence DB du déroulé SESSION : persistDerouleSession appelé 2× →
 *    `create` appelé EXACTEMENT 1× (findFirst-then-update/create, pas un create
 *    inconditionnel ni un upsert compound key sur NULL).
 *
 * Tests de puissance :
 *  - retirer le filtre SATISFACTION_FROID → Test gate froid ROUGE.
 *  - remplacer la branche du déroulé par un create inconditionnel → 2 assets ROUGE.
 */

import {
  sanitize,
  formatDateFR,
  buildSessionPaths,
  kindsForFroid,
  isFroidEligible,
  ROOT_FILE_PROGRAMME,
  ROOT_FILE_DEROULE,
  ROOT_FILE_CHECKLIST,
} from '../../../../scripts/gen-session-pack-helpers';

// ─── Mocks pour le Test 5 (idempotence DB déroulé session) ─────────────
const pedFindFirst = vi.fn();
const pedCreate = vi.fn();
const pedUpdate = vi.fn();
const sessionFindFirst = vi.fn();

vi.mock('@qualiof/db', () => ({
  prisma: {
    pedagogicalAsset: {
      findFirst: (...a: unknown[]) => pedFindFirst(...a),
      create: (...a: unknown[]) => pedCreate(...a),
      update: (...a: unknown[]) => pedUpdate(...a),
    },
    trainingSession: {
      findFirst: (...a: unknown[]) => sessionFindFirst(...a),
    },
  },
}));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue({ key: 'k', bucket: 'qualiof-docs', size: 1 }),
}));

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdfWeasy: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

vi.mock('../build-context', () => ({
  buildClosureContextForParticipant: vi.fn().mockResolvedValue({
    sessionTitle: 'Formation X',
    durationHours: 8,
    formationMeta: { programmeMd: '## prog' },
    sessionTrainers: ['Jean Dupont'],
    tenantId: 'tnt-1',
  }),
}));

vi.mock('../ollama-generators', () => ({
  generateDerouleContent: vi.fn().mockResolvedValue({ jours: [{ sequences: [] }] }),
}));

vi.mock('../deroule-template', () => ({
  renderDerouleHtml: vi.fn().mockReturnValue('<html></html>'),
}));

import { persistDerouleSession } from '../generate-deroule-session';

const FROID_KINDS = ['SATISFACTION_FROID'];

describe('gate froid', () => {
  it('Test 1 — isFroidEligible : false à -89j, true à -90j et -120j', () => {
    const now = new Date('2026-06-18T00:00:00Z');
    const minus = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(isFroidEligible(minus(89), now)).toBe(false);
    expect(isFroidEligible(minus(90), now)).toBe(true);
    expect(isFroidEligible(minus(120), now)).toBe(true);
  });

  it('Test 1b — kindsForFroid filtre SATISFACTION_FROID si non éligible (test de puissance)', () => {
    const filtered = kindsForFroid(false);
    const kept = kindsForFroid(true);
    // Non éligible → SATISFACTION_FROID ABSENT (retirer le filtre fait virer rouge).
    expect(filtered).not.toContain(FROID_KINDS[0]);
    // Éligible → présent.
    expect(kept).toContain(FROID_KINDS[0]);
    // Le filtre ne retire QUE le froid.
    expect(kept.length - filtered.length).toBe(1);
  });
});

describe('helpers Drive', () => {
  it('Test 2 — sanitize retire les caractères interdits et collapse les espaces', () => {
    const out = sanitize('Vente & "négo"/2026 : intro*?<>|');
    expect(out).not.toMatch(/[/\\:*?"<>|]/);
    expect(out).not.toMatch(/\s{2,}/);
  });

  it('Test 3 — formatDateFR : 2026-03-09 → 09-03-2026 (UTC, padStart)', () => {
    expect(formatDateFR(new Date('2026-03-09T00:00:00Z'))).toBe('09-03-2026');
    expect(formatDateFR(new Date('2026-12-01T23:59:59Z'))).toBe('01-12-2026');
  });

  it('Test 4 — buildSessionPaths : racine vs apprenant + idempotence', () => {
    const learners = [
      { prenom: 'Alice', nom: 'Martin' },
      { prenom: 'Bob', nom: 'Durand' },
    ];
    const a = buildSessionPaths('/drive/base', 'Vente immobilière', new Date('2026-03-09T00:00:00Z'), learners);

    // Racine = Programme / Déroulé / Checklist
    expect(a.rootFiles).toEqual([ROOT_FILE_PROGRAMME, ROOT_FILE_DEROULE, ROOT_FILE_CHECKLIST]);
    // Programme/Déroulé NE figurent PAS dans learnerDirs (jamais chez l'apprenant).
    for (const dir of a.learnerDirs) {
      expect(dir).not.toContain(ROOT_FILE_PROGRAMME);
      expect(dir).not.toContain(ROOT_FILE_DEROULE);
    }
    expect(a.learnerDirs).toHaveLength(2);
    expect(a.rootDir).toBe('/drive/base/Vente immobilière (09-03-2026)');

    // Idempotence : 2e appel → MÊMES chemins (pas de suffixe (1)).
    const b = buildSessionPaths('/drive/base', 'Vente immobilière', new Date('2026-03-09T00:00:00Z'), learners);
    expect(b).toEqual(a);
  });
});

describe('idempotence DB déroulé session', () => {
  beforeEach(() => {
    pedFindFirst.mockReset();
    pedCreate.mockReset();
    pedUpdate.mockReset();
    sessionFindFirst.mockReset();
    sessionFindFirst.mockResolvedValue({
      id: 'ses-1',
      code: 'SES-0001',
      tenantId: 'tnt-1',
      product: { programMd: '## prog', title: 'Formation X', durationHours: 8 },
      participants: [{ id: 'part-1' }],
    });
    pedCreate.mockResolvedValue({ id: 'asset-1', pdfUrl: 'deroules/SES-0001/abc.pdf' });
    pedUpdate.mockResolvedValue({ id: 'asset-1', pdfUrl: 'deroules/SES-0001/def.pdf' });
  });

  it('Test 5 — 2 appels (force) → create appelé EXACTEMENT 1× (1er=create, 2e=update)', async () => {
    // 1er appel : findFirst → null → create.
    pedFindFirst.mockResolvedValueOnce(null);
    const r1 = await persistDerouleSession('tnt-1', 'ses-1', { force: true });
    expect(r1.ok).toBe(true);
    expect(pedCreate).toHaveBeenCalledTimes(1);
    expect(pedUpdate).toHaveBeenCalledTimes(0);

    // 2e appel (force) : findFirst → asset existant → update (PAS un nouveau create).
    pedFindFirst.mockResolvedValueOnce({ id: 'asset-1', pdfUrl: 'deroules/SES-0001/abc.pdf' });
    const r2 = await persistDerouleSession('tnt-1', 'ses-1', { force: true });
    expect(r2.ok).toBe(true);

    // Bilan : create EXACTEMENT 1× sur les 2 appels → 1 seul asset.
    expect(pedCreate).toHaveBeenCalledTimes(1);
    expect(pedUpdate).toHaveBeenCalledTimes(1);
  });

  it('Test 5b — sans force, asset existant → court-circuit (pas de LLM, pas de create/update)', async () => {
    pedFindFirst.mockResolvedValueOnce({ id: 'asset-1', pdfUrl: 'deroules/SES-0001/abc.pdf' });
    const r = await persistDerouleSession('tnt-1', 'ses-1');
    expect(r.ok).toBe(true);
    expect(r.assetId).toBe('asset-1');
    expect(pedCreate).toHaveBeenCalledTimes(0);
    expect(pedUpdate).toHaveBeenCalledTimes(0);
  });
});
