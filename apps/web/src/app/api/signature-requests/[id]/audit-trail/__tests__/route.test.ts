/**
 * `GET /api/signature-requests/[id]/audit-trail` — le certificat de signature,
 * servi comme une pièce à part entière (lot D, défaut D-C3-5).
 *
 * POURQUOI UNE ROUTE À PART, ET PAS `/api/documents/[id]`. Le certificat
 * appartient à la DEMANDE, pas au document : une demande peut couvrir plusieurs
 * pièces, et le certificat les couvre toutes. L'accrocher à un document
 * obligerait à choisir lequel, et à servir le même fichier sous deux noms.
 *
 * Ce que ce fichier garde :
 *
 *  1. **Auth, puis TENANT.** Une demande d'un autre organisme est un 404, pas un
 *     403 : on ne confirme pas l'existence d'un identifiant qu'on ne sert pas.
 *  2. **PAS DE CERTIFICAT ⇒ 404.** Une demande partie mais non close n'en a pas.
 *  3. **LE NOM PARLANT VOYAGE AVEC LA SIGNED URL.** En production la route
 *     redirige vers Supabase : c'est le paramètre `download` qui nomme le
 *     fichier, jamais le `Content-Disposition` de la route (leçon du 08/09).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findFirstMock, validateMock, signedUrlMock, downloadMock, providerRef } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  validateMock: vi.fn(),
  signedUrlMock: vi.fn(),
  downloadMock: vi.fn(),
  providerRef: { value: 'supabase' as string },
}));

vi.mock('@qualiof/db', () => ({
  prisma: { signatureRequest: { findFirst: findFirstMock } },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: validateMock }));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  createSignedDownloadUrl: signedUrlMock,
  downloadFile: downloadMock,
  get _internals() {
    return { PROVIDER: providerRef.value };
  },
}));

import { GET } from '../route';

const DEMANDE = {
  id: 'req-9',
  auditTrailUrl: 'sessions/t1/SES-0112/signed/convention.audit-trail.pdf',
  session: { code: 'SES-0112' },
  documents: [
    {
      type: 'CONVENTION',
      participant: { person: { firstName: 'Stéphane', lastName: 'Rousseau' } },
    },
  ],
};

function requete(url = 'https://qualiof.example.com/api/signature-requests/req-9/audit-trail') {
  return new Request(url);
}
const contexte = { params: Promise.resolve({ id: 'req-9' }) };

beforeEach(() => {
  vi.clearAllMocks();
  providerRef.value = 'supabase';
  validateMock.mockResolvedValue({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' } });
  findFirstMock.mockResolvedValue(DEMANDE);
  signedUrlMock.mockResolvedValue('https://supabase.test/signed?download=x');
  downloadMock.mockResolvedValue(Buffer.from('%PDF-1.4 certificat'));
});

describe('GET audit-trail — la porte', () => {
  it('401 sans session', async () => {
    validateMock.mockResolvedValue({ user: null });
    const res = await GET(requete(), contexte);
    expect(res.status).toBe(401);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('la recherche est SCOPÉE au tenant — jamais un findUnique sur l’id seul', async () => {
    await GET(requete(), contexte);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req-9', tenantId: 't1' } }),
    );
  });

  it('404 quand la demande n’existe pas (ou appartient à un autre organisme)', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await GET(requete(), contexte);
    expect(res.status).toBe(404);
  });

  it('404 quand la demande n’a pas encore de certificat', async () => {
    findFirstMock.mockResolvedValue({ ...DEMANDE, auditTrailUrl: null });
    const res = await GET(requete(), contexte);
    expect(res.status).toBe(404);
  });
});

describe('GET audit-trail — le fichier servi', () => {
  it('redirige vers une signed URL FRAÎCHE, en portant le nom parlant', async () => {
    const res = await GET(
      requete('https://qualiof.example.com/api/signature-requests/req-9/audit-trail?dl=1'),
      contexte,
    );
    expect(res.status).toBe(302);
    expect(signedUrlMock).toHaveBeenCalledWith(
      'qualiof-docs',
      'sessions/t1/SES-0112/signed/convention.audit-trail.pdf',
      600,
      'Certificat-de-signature-Stephane-ROUSSEAU-SES-0112.pdf',
    );
  });

  it('sans `?dl=1`, le certificat s’OUVRE : on ne force pas un téléchargement', async () => {
    await GET(requete(), contexte);
    expect(signedUrlMock).toHaveBeenCalledWith(
      'qualiof-docs',
      'sessions/t1/SES-0112/signed/convention.audit-trail.pdf',
      600,
      undefined,
    );
  });

  it('en local (MinIO), le PDF est proxifié avec le même nom', async () => {
    providerRef.value = 'minio';
    const res = await GET(
      requete('https://qualiof.example.com/api/signature-requests/req-9/audit-trail?dl=1'),
      contexte,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="Certificat-de-signature-Stephane-ROUSSEAU-SES-0112.pdf"',
    );
    // Un certificat régénéré garderait la même URL : pas de cache navigateur.
    expect(res.headers.get('cache-control')).toBe('no-store, must-revalidate');
  });

  it('une demande COLLECTIVE (convention de groupe) est nommée sans personne', async () => {
    findFirstMock.mockResolvedValue({
      ...DEMANDE,
      documents: [{ type: 'CONVENTION', participant: null }],
    });
    await GET(
      requete('https://qualiof.example.com/api/signature-requests/req-9/audit-trail?dl=1'),
      contexte,
    );
    expect(signedUrlMock).toHaveBeenCalledWith(
      'qualiof-docs',
      expect.any(String),
      600,
      'Certificat-de-signature-SES-0112.pdf',
    );
  });
});
