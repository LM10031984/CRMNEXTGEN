import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `POST /api/webhooks/docuseal` — la seule porte d'entrée des documents signés.
 *
 * C'est un endpoint PUBLIC : il n'a pas de session, pas de `requireRole`, pas de
 * cookie. Sa seule garde est la signature HMAC du prestataire. Ce fichier garde
 * quatre choses, et chacune a un coût si elle tombe :
 *
 *  1. **Les OCTETS EXACTS.** La signature porte sur le corps tel qu'envoyé. Lire
 *     `req.json()` puis re-sérialiser changerait un espace ou un ordre de clés,
 *     et toute vérification échouerait — y compris les vraies.
 *  2. **FAIL-CLOSED.** Signature invalide ⇒ 401 et RIEN n'est traité. Pas de
 *     prestataire configuré ⇒ 503, jamais un traitement « au cas où ».
 *  3. **LES CODES PILOTENT LE PRESTATAIRE.** Un 5xx le fait rejouer. Rendre 500
 *     sur une demande inconnue le ferait boucler indéfiniment sur un envoi qui
 *     ne nous concerne pas.
 *  4. **MUETTE SUR LA RAISON** d'un refus : on ne dit pas à un appelant non
 *     authentifié si c'est le secret, l'horodatage ou la signature qui cloche.
 */

const { getProviderMock, traiterMock, verifyMock, parseMock } = vi.hoisted(() => ({
  getProviderMock: vi.fn(),
  traiterMock: vi.fn(),
  verifyMock: vi.fn(),
  parseMock: vi.fn(),
}));

vi.mock('@/lib/signature/provider', () => {
  class SignatureNotConfiguredError extends Error {}
  return { getSignatureProvider: getProviderMock, SignatureNotConfiguredError };
});
vi.mock('@/server/signature-retour', async () => {
  const REJOUABLES = new Set(['telechargement-impossible', 'aucun-document-signe']);
  return {
    traiterEvenementSignature: traiterMock,
    estRejouable: (m: string) => REJOUABLES.has(m),
  };
});

import { POST } from '../route';

const CORPS = '{"event_type":"form.completed","timestamp":"2026-09-20T14:30:00Z","data":{"id":"sg-1","submission_id":"sub-42"}}';

function requete(body = CORPS, headers: Record<string, string> = {}): Request {
  return new Request('https://qualiof.example.com/api/webhooks/docuseal', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-docuseal-signature': '123.abc', ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyMock.mockReturnValue(true);
  parseMock.mockReturnValue({
    type: 'signer.completed',
    providerId: 'sub-42',
    signerId: 'sg-1',
    signerEmail: null,
    auditTrailUrl: null,
    occurredAt: new Date('2026-09-20T14:30:00.000Z'),
    raw: {},
  });
  getProviderMock.mockReturnValue({ name: 'docuseal', verifyWebhook: verifyMock, parseEvent: parseMock });
  traiterMock.mockResolvedValue({ traite: true, motif: 'signature-enregistree' });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('authentification — fail-closed, et muette', () => {
  it('signature invalide ⇒ 401, et RIEN n’est traité', async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(requete());
    expect(res.status).toBe(401);
    expect(traiterMock).not.toHaveBeenCalled();
  });

  it('PUISSANCE — le refus ne dit PAS ce qui clochait', async () => {
    verifyMock.mockReturnValue(false);
    const corps = (await (await POST(requete())).json()) as { error: string };
    expect(corps.error).toBe('signature-invalide');
    for (const indice of ['secret', 'timestamp', 'horodat', 'hmac']) {
      expect(corps.error.toLowerCase()).not.toContain(indice);
    }
  });

  it('pas de prestataire configuré ⇒ 503, jamais un traitement « au cas où »', async () => {
    const { SignatureNotConfiguredError } = (await import('@/lib/signature/provider')) as unknown as {
      SignatureNotConfiguredError: new (m: string) => Error;
    };
    getProviderMock.mockImplementation(() => {
      throw new SignatureNotConfiguredError('pas de clé');
    });
    const res = await POST(requete());
    expect(res.status).toBe(503);
    expect(traiterMock).not.toHaveBeenCalled();
  });
});

describe('les OCTETS EXACTS', () => {
  it('`verifyWebhook` reçoit le corps TEL QUEL, jamais un JSON re-sérialisé', async () => {
    // Espaces et ordre de clés inhabituels : re-sérialiser les normaliserait,
    // et la signature ne correspondrait plus.
    const brut = '{ "event_type" : "form.completed" ,  "data" : { "id" : "sg-1" } }';
    await POST(requete(brut));
    expect(verifyMock.mock.calls[0]![0]).toBe(brut);
  });

  it('les en-têtes arrivent en MINUSCULES — le prestataire ne garantit pas la casse', async () => {
    await POST(requete(CORPS, { 'X-Docuseal-Signature': '999.zzz' }));
    const entetes = verifyMock.mock.calls[0]![1] as Record<string, string>;
    expect(entetes['x-docuseal-signature']).toBeDefined();
  });
});

describe('la traduction et l’aiguillage', () => {
  it('passe le type BRUT du prestataire, pas notre type de domaine', async () => {
    await POST(requete());
    const args = traiterMock.mock.calls[0]![0] as { typeBrut: string; event: { type: string } };
    // `form.completed` et `form.declined` deviennent tous deux des événements de
    // signataire : les confondre dans la clé d'idempotence perdrait le second.
    expect(args.typeBrut).toBe('form.completed');
    expect(args.event.type).toBe('signer.completed');
  });

  it('un corps illisible ⇒ 400, et rien n’est traité', async () => {
    parseMock.mockImplementation(() => {
      throw new Error('DocuSeal : payload de webhook illisible (JSON invalide)');
    });
    const res = await POST(requete('pas du json'));
    expect(res.status).toBe(400);
    expect(traiterMock).not.toHaveBeenCalled();
  });

  it('un corps sans `event_type` passe quand même, avec un type brut nommé', async () => {
    await POST(requete('{"data":{}}'));
    expect((traiterMock.mock.calls[0]![0] as { typeBrut: string }).typeBrut).toBe('inconnu');
  });
});

describe('LES CODES DE RETOUR pilotent le prestataire', () => {
  it.each([
    ['signature-enregistree', true],
    ['demande-inconnue', false],
    ['deja-traite', false],
    ['signataire-introuvable', false],
    ['evenement-ignore:submission.created', false],
  ])('%s ⇒ 200 : définitif, le prestataire ne rejoue pas', async (motif, traite) => {
    traiterMock.mockResolvedValue({ traite, motif });
    const res = await POST(requete());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, traite, motif });
  });

  it.each(['telechargement-impossible', 'aucun-document-signe'])(
    '%s ⇒ 503 : temporaire, le prestataire DOIT rejouer',
    async (motif) => {
      traiterMock.mockResolvedValue({ traite: false, motif });
      expect((await POST(requete())).status).toBe(503);
    },
  );

  it('PUISSANCE — « demande inconnue » ne fait PAS rejouer : sinon le prestataire boucle', async () => {
    traiterMock.mockResolvedValue({ traite: false, motif: 'demande-inconnue' });
    expect((await POST(requete())).status).toBe(200);
  });
});
