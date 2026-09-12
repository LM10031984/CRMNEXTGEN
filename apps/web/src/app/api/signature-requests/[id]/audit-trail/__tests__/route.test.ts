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

const STEPHANE = { firstName: 'Stéphane', lastName: 'Rousseau' };

const DEMANDE = {
  id: 'req-9',
  auditTrailUrl: 'sessions/t1/SES-0112/signed/convention.audit-trail.pdf',
  session: {
    code: 'SES-0112',
    participants: [{ sponsorOrgId: 'org-1', person: STEPHANE }],
  },
  documents: [
    {
      type: 'CONVENTION',
      entityType: 'participant',
      entityId: null,
      participant: { person: STEPHANE },
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
      'Certificat-de-signature-Convention-Stephane-ROUSSEAU-SES-0112.pdf',
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
      'attachment; filename="Certificat-de-signature-Convention-Stephane-ROUSSEAU-SES-0112.pdf"',
    );
    // Un certificat régénéré garderait la même URL : pas de cache navigateur.
    expect(res.headers.get('cache-control')).toBe('no-store, must-revalidate');
  });

  it('une convention de GROUPE couvrant deux salariés est nommée sans personne', async () => {
    // Un fichier unique ne peut pas s'appeler du nom de l'un des deux.
    findFirstMock.mockResolvedValue({
      ...DEMANDE,
      session: {
        code: 'SES-0112',
        participants: [
          { sponsorOrgId: 'org-1', person: { firstName: 'Alice', lastName: 'Martin' } },
          { sponsorOrgId: 'org-1', person: { firstName: 'Bob', lastName: 'Durand' } },
        ],
      },
      documents: [
        { type: 'CONVENTION', entityType: 'organization', entityId: 'org-1', participant: null },
      ],
    });
    await GET(
      requete('https://qualiof.example.com/api/signature-requests/req-9/audit-trail?dl=1'),
      contexte,
    );
    expect(signedUrlMock).toHaveBeenCalledWith(
      'qualiof-docs',
      expect.any(String),
      600,
      'Certificat-de-signature-Convention-SES-0112.pdf',
    );
  });

  it('une convention d’ENTREPRISE INDIVIDUELLE stockée en groupe nomme SON inscrit', async () => {
    // ⚠ LE CAS DE LA RECETTE (DEMO-SIG-01, 12/09/2026). La route rendait
    // `Certificat-de-signature-Convention-DEMO-SIG-01.pdf` quand le dossier
    // rendait `…-Convention-Julien-DEMO-SIG-BERNARD-DEMO-SIG-01.pdf` : deux noms
    // pour UN fichier. La pièce ne porte pas de participant, elle porte son
    // organisation — qui ne compte qu'un inscrit.
    findFirstMock.mockResolvedValue({
      ...DEMANDE,
      session: {
        code: 'DEMO-SIG-01',
        participants: [
          {
            sponsorOrgId: 'org-julien-ei',
            person: { firstName: 'Julien', lastName: 'DEMO-SIG BERNARD' },
          },
          { sponsorOrgId: 'org-provence', person: { firstName: 'Alice', lastName: 'Martin' } },
        ],
      },
      documents: [
        {
          type: 'CONVENTION',
          entityType: 'organization',
          entityId: 'org-julien-ei',
          participant: null,
        },
      ],
    });
    await GET(
      requete('https://qualiof.example.com/api/signature-requests/req-9/audit-trail?dl=1'),
      contexte,
    );
    expect(signedUrlMock).toHaveBeenCalledWith(
      'qualiof-docs',
      expect.any(String),
      600,
      'Certificat-de-signature-Convention-Julien-DEMO-SIG-BERNARD-DEMO-SIG-01.pdf',
    );
  });
});
