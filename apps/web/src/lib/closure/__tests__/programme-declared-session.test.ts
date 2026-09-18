import { expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  session: vi.fn(),
  product: vi.fn(),
  render: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: f.session },
    trainingProduct: { findFirst: f.product },
    document: { findFirst: vi.fn(async () => null), deleteMany: vi.fn(), create: f.create },
  },
}));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'test', uploadFile: vi.fn() }));
vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdfWeasy: vi.fn(async () => Buffer.from('test')),
}));
vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn(async () => ({ addressFull: 'Adresse test' })),
}));
vi.mock('@/lib/programme-template', () => ({ renderProgrammeHtml: f.render }));
vi.mock('@/lib/docs/document-source', () => ({
  computeDocumentFingerprint: vi.fn(async () => 'source'),
}));
import { generateProgrammeForSessionOrProductCore } from '../programme-core';
it('la voie publique de génération utilise le forfait de session même avant le premier inscrit', async () => {
  f.session.mockResolvedValue({
    id: 's',
    code: 'SES-TEST',
    productId: 'catalogue',
    regime: 'ENTREPRISE',
    priceTotalHT: 240,
    pricePerLearner: null,
    startDate: new Date('2026-11-20'),
    endDate: new Date('2026-11-20'),
    product: {
      title: 'Formation test',
      pricingMode: 'PAR_STAGIAIRE',
      priceHT: 120,
      objectives: [],
    },
    participants: [],
    trainers: [],
    location: null,
  });
  f.render.mockReturnValue('<html>programme</html>');
  f.create.mockResolvedValue({ id: 'doc', pdfUrl: 'test.pdf' });
  expect(await generateProgrammeForSessionOrProductCore('tenant', 's')).toMatchObject({ ok: true });
  expect(f.product).not.toHaveBeenCalled();
  expect(f.render).toHaveBeenCalledWith(
    expect.objectContaining({ produitPriceHT: 240, prixMode: 'TOTAL_ENTREPRISE' }),
    expect.anything(),
  );
});
