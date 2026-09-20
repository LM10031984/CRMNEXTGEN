import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: vi.fn(), resolve: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/rbac', () => ({
  requireRole: mocks.role,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock('@/lib/opco/company-portal-documents', () => ({
  resolveCompanyPortalPiece: mocks.resolve,
}));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'docs',
  downloadFile: mocks.download,
  createSignedDownloadUrl: vi.fn(),
  _internals: { PROVIDER: 'minio' },
}));

import { GET } from '../route';
import { UnauthorizedError } from '@/lib/rbac';

const context = {
  params: Promise.resolve({
    sessionId: 'session',
    sponsorOrgId: 'org',
    participantId: 'participant',
    kind: 'CONVENTION',
  }),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: 'user', tenantId: 'tenant' });
  mocks.resolve.mockResolvedValue({ key: 'private/key.pdf', filename: 'Convention.pdf' });
  mocks.download.mockResolvedValue(Buffer.from('pdf'));
});

describe('route privée pièces portail OPCO', () => {
  it('résout la pièce depuis les identifiants métier sans accepter de clé client', async () => {
    const response = await GET(new Request('https://qualiof.test/piece?dl=1'), context);
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith({
      sessionId: 'session',
      sponsorOrgId: 'org',
      participantId: 'participant',
      kind: 'CONVENTION',
      user: { id: 'user', tenantId: 'tenant' },
    });
    expect(mocks.download).toHaveBeenCalledWith('docs', 'private/key.pdf');
    expect(response.headers.get('content-disposition')).toContain('attachment');
  });

  it('retourne 404 quand le tenant, le groupe ou la pièce ne correspondent pas', async () => {
    mocks.resolve.mockResolvedValue(null);
    const response = await GET(new Request('https://qualiof.test/piece'), context);
    expect(response.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('refuse une requête non authentifiée avant toute résolution de pièce', async () => {
    mocks.role.mockRejectedValue(new UnauthorizedError());
    const response = await GET(new Request('https://qualiof.test/piece'), context);
    expect(response.status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
