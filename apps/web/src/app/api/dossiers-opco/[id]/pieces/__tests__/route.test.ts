import { beforeEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  sub: vi.fn(),
  download: vi.fn(),
  signedUrl: vi.fn(),
  provider: { PROVIDER: 'minio' },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: m.auth }));
vi.mock('@/server/actions/opco-submission', () => ({ getOpcoSubmission: m.sub }));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'docs',
  downloadFile: m.download,
  createSignedDownloadUrl: m.signedUrl,
  _internals: m.provider,
}));
import { GET } from '../route';
const request = (params = 'kind=PROGRAMME&filename=programme.pdf') =>
  GET(new Request(`https://example.test/api/dossiers-opco/draft/pieces?${params}`), {
    params: Promise.resolve({ id: 'draft' }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.provider.PROVIDER = 'minio';
  m.auth.mockResolvedValue({ user: { role: 'ADMIN' } });
  m.sub.mockResolvedValue({
    attachments: [{ kind: 'PROGRAMME', filename: 'programme.pdf', key: 'private/programme.pdf' }],
  });
  m.download.mockResolvedValue(Buffer.from('%PDF-1.7'));
});
describe('consultation des pièces du dossier', () => {
  it('sert seulement la pièce résolue côté serveur, en privé', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(m.download).toHaveBeenCalledWith('docs', 'private/programme.pdf');
  });
  it('refuse une pièce hors dossier', async () => {
    expect((await request('kind=CNI&filename=other.pdf&key=another-tenant/cni.pdf')).status).toBe(
      404,
    );
    expect(m.download).not.toHaveBeenCalled();
  });
  it('refuse un dossier inaccessible au tenant via le résolveur autorisé', async () => {
    m.sub.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(m.download).not.toHaveBeenCalled();
  });
  it('exige authentification et rôle administratif', async () => {
    m.auth.mockResolvedValue({ user: null });
    expect((await request()).status).toBe(401);
    m.auth.mockResolvedValue({ user: { role: 'LECTEUR' } });
    expect((await request()).status).toBe(403);
    expect(m.sub).not.toHaveBeenCalled();
  });
});

it('redirige vers une URL Supabase privée courte sans cache', async () => {
  m.provider.PROVIDER = 'supabase';
  m.signedUrl.mockResolvedValue('https://storage.example.test/private-signed');
  const res = await request();
  expect(res.status).toBe(302);
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(m.signedUrl).toHaveBeenCalledWith('docs', 'private/programme.pdf', 300);
  expect(m.download).not.toHaveBeenCalled();
});
