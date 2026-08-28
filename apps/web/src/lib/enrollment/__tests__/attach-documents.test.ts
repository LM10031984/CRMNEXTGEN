import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Après validation d'une demande, la fiche apprenant doit afficher CNI, RIB et
 * attestation CFP. Bug constaté le 28/08/2026 : elle n'en affichait aucun — les
 * pièces restaient dans le bucket `preinscriptions` alors que la fiche lit
 * `qualiof-docs`.
 */

const m = vi.hoisted(() => ({ downloadFile: vi.fn(), uploadFile: vi.fn() }));

vi.mock('@/lib/storage', () => ({
  downloadFile: m.downloadFile,
  uploadFile: m.uploadFile,
  DOCS_BUCKET: 'qualiof-docs',
  PREENROLLMENT_BUCKET: 'preinscriptions',
}));

import { copyEnrollmentDocs } from '../attach-documents';

beforeEach(() => {
  vi.clearAllMocks();
  m.downloadFile.mockResolvedValue(Buffer.from('x'));
  m.uploadFile.mockResolvedValue({ key: 'k', bucket: 'b', size: 1 });
});

describe('copyEnrollmentDocs', () => {
  it('copie les 3 pièces vers le bucket des documents apprenant', async () => {
    const r = await copyEnrollmentDocs(
      {
        cniKey: 'sessions/s1/d1/cni-1.pdf',
        ribKey: 'sessions/s1/d1/rib-1.jpg',
        cfpKey: 'sessions/s1/d1/cfp-1.png',
      },
      'tenant-1',
      'per-1',
    );

    expect(r.warnings).toEqual([]);
    expect(m.uploadFile).toHaveBeenCalledTimes(3);
    const buckets = m.uploadFile.mock.calls.map((c: any) => c[0]);
    expect(buckets).toEqual(['qualiof-docs', 'qualiof-docs', 'qualiof-docs']);
    expect(r.cniKey).toMatch(/^apprenants\/tenant-1\/per-1\/cni-[0-9a-f-]+\.pdf$/);
    expect(r.ribKey).toMatch(/\.jpg$/);
    expect(r.cfpKey).toMatch(/\.png$/);
  });

  it('lit bien depuis le bucket des pré-inscriptions', async () => {
    await copyEnrollmentDocs({ cniKey: 'k.pdf', ribKey: null, cfpKey: null }, 't', 'p');
    expect(m.downloadFile).toHaveBeenCalledWith('preinscriptions', 'k.pdf');
  });

  it('conserve le type MIME d’après l’extension', async () => {
    await copyEnrollmentDocs({ cniKey: 'x/cni-1.jpeg', ribKey: null, cfpKey: null }, 't', 'p');
    expect(m.uploadFile.mock.calls[0]![3]).toBe('image/jpeg');
  });

  it('l’échec d’une pièce n’empêche pas les autres', async () => {
    m.downloadFile.mockRejectedValueOnce(new Error('objet introuvable'));
    const r = await copyEnrollmentDocs(
      { cniKey: 'a.pdf', ribKey: 'b.pdf', cfpKey: null },
      't',
      'p',
    );
    expect(r.cniKey).toBeUndefined();
    expect(r.ribKey).toBeDefined();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/CNI/);
  });

  it('ne fait rien quand aucune pièce n’a été déposée', async () => {
    const r = await copyEnrollmentDocs({ cniKey: null, ribKey: null, cfpKey: null }, 't', 'p');
    expect(m.uploadFile).not.toHaveBeenCalled();
    expect(r.warnings).toEqual([]);
  });
});
