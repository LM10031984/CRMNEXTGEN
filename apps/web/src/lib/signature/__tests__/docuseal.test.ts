import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

/**
 * Lot B — adaptateur DocuSeal (spec 2026-09-04 §5 lot B).
 *
 * L'adaptateur est la SEULE brique qui connaît DocuSeal ; tout le reste de
 * QualiOF ne voit que le port `SignatureProvider` (§O-2 : remplaçable par
 * Yousign si un financeur exige un prestataire français).
 *
 * HERMÉTIQUE : `global.fetch` mocké. Aucun appel réseau ne doit partir d'un
 * test — un envoi silencieux vers l'API réelle enverrait de vrais emails.
 *
 * Ce qui est verrouillé ici :
 *  1. `createRequest` → POST /submissions/pdf, en-tête `X-Auth-Token`,
 *     `send_email: false` (D-9 : QualiOF garde la main sur les emails via son
 *     mailer fail-closed), ordre de signature préservé (D-3 : client puis OF).
 *  2. Le PDF part en base64 et le lien de signature revient (`embed_src`) —
 *     sans lui, QualiOF n'a rien à mettre dans son email.
 *  3. `verifyWebhook` : HMAC-SHA256 sur `timestamp.rawBody`, fenêtre 5 min,
 *     comparaison à temps constant, et **fail-closed sans secret**.
 *  4. `downloadAuditTrail` : le certificat de signature est une pièce à part
 *     entière (règle métier n°3 — c'est ce que les AGEFICE réclament).
 *  5. `metadata.lang: 'fr-FR'` sur **chaque** signataire : ce certificat va au
 *     dossier AGEFICE, il doit être lisible par un financeur français.
 *     DocuSeal lit la langue du dernier signataire ayant complété — n'en
 *     équiper qu'un seul rendrait le résultat dépendant de l'ordre réel.
 *
 * PROTOCOLE DE MUTATION : passer `send_email: true` dans docuseal.ts → test 2
 * ROUGE. Retirer le contrôle de fraîcheur du timestamp → test « rejoue » ROUGE.
 * Retirer `metadata.lang` d'un SEUL signataire → test « certificat en
 * français » ROUGE.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { createDocusealProvider } from '@/lib/signature/docuseal';

const API_KEY = 'test-api-key';
const BASE_URL = 'https://api.docuseal.test';
const WEBHOOK_SECRET = 'whsec_test_secret';

function provider() {
  return createDocusealProvider({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    webhookSecret: WEBHOOK_SECRET,
  });
}

function jsonOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Réponse RÉELLE de `POST /submissions/pdf`, relevée le 04/09/2026 contre
 * api.docuseal.com. À ne pas « simplifier » : l'exemple de la spec OpenAPI
 * publiée laisse croire à un tableau de submitters, alors que l'API répond un
 * OBJET (`id` + `submitters` + `fields`). Un mock inventé ici avait laissé
 * passer un adaptateur qui échouait dès le premier appel réel.
 */
const CREATE_RESPONSE = {
  id: 42,
  name: 'SES-0042 — Convention Agence Dupont',
  status: 'pending',
  submitters_order: 'preserved',
  submitters: [
    {
      id: 501,
      submission_id: 42,
      uuid: 'uuid-client',
      email: 'dirigeant@agence.fr',
      name: 'Marie Dupont',
      role: 'Client',
      slug: 'pAMimKcyrLjqVt',
      status: 'awaiting',
      external_id: 'sr-uuid-1:Client',
      completed_at: null,
      preferences: { send_email: false, send_sms: false },
      embed_src: 'https://docuseal.test/s/pAMimKcyrLjqVt',
    },
    {
      id: 502,
      submission_id: 42,
      uuid: 'uuid-of',
      email: 'laurent@start-academy.fr',
      name: 'Laurent MARX',
      role: 'Organisme de formation',
      slug: 'zZz9',
      status: 'awaiting',
      external_id: 'sr-uuid-1:Organisme de formation',
      completed_at: null,
      preferences: { send_email: false, send_sms: false },
      embed_src: 'https://docuseal.test/s/zZz9',
    },
  ],
  // Les champs créés à partir des ancres `{{…}}` du PDF (D-7).
  fields: [
    {
      name: 'Signature client',
      type: 'signature',
      required: true,
      uuid: 'f-client',
      submitter_uuid: 'uuid-client',
      areas: [{ page: 4, x: 0.1, y: 0.22, w: 0.33, h: 0.07 }],
    },
    {
      name: 'Signature organisme de formation',
      type: 'signature',
      required: true,
      uuid: 'f-of',
      submitter_uuid: 'uuid-of',
      areas: [{ page: 4, x: 0.55, y: 0.22, w: 0.33, h: 0.07 }],
    },
  ],
};

const CREATE_INPUT = {
  name: 'SES-0042 — Convention Agence Dupont',
  externalId: 'sr-uuid-1',
  documents: [{ name: 'convention', pdf: Buffer.from('%PDF-1.7 fake convention') }],
  signers: [
    { role: 'Client', name: 'Marie Dupont', email: 'dirigeant@agence.fr', order: 0 },
    { role: 'Organisme de formation', name: 'Laurent MARX', email: 'laurent@start-academy.fr', order: 1 },
  ],
  expiresAt: new Date('2026-10-04T12:00:00.000Z'),
};

describe('DocuSeal — createRequest', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonOk(CREATE_RESPONSE));
  });

  it('poste sur /submissions/pdf avec le jeton X-Auth-Token', async () => {
    await provider().createRequest(CREATE_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/submissions/pdf`);
    expect(init.method).toBe('POST');
    expect(init.headers['X-Auth-Token']).toBe(API_KEY);
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('coupe l’envoi d’emails côté DocuSeal (D-9 — QualiOF envoie via son mailer)', async () => {
    await provider().createRequest(CREATE_INPUT);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);

    expect(body.send_email).toBe(false);
    expect(body.submitters.every((s: { send_email: boolean }) => s.send_email === false)).toBe(true);
  });

  it('demande le certificat de signature en français, sur CHAQUE signataire', async () => {
    await provider().createRequest(CREATE_INPUT);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);

    // DocuSeal compose le certificat dans la langue du dernier signataire
    // ayant complété : `every`, pas `some` — oublier un signataire suffirait à
    // rendre la pièce AGEFICE en anglais selon qui signe en dernier.
    expect(body.submitters).toHaveLength(2);
    expect(
      body.submitters.every((s: { metadata?: { lang?: string } }) => s.metadata?.lang === 'fr-FR'),
    ).toBe(true);
  });

  it('préserve l’ordre de signature client → OF (D-3)', async () => {
    await provider().createRequest(CREATE_INPUT);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);

    expect(body.order).toBe('preserved');
    expect(body.submitters.map((s: { role: string }) => s.role)).toEqual([
      'Client',
      'Organisme de formation',
    ]);
    expect(body.submitters.map((s: { order: number }) => s.order)).toEqual([0, 1]);
  });

  it('envoie le PDF en base64 et propage la date d’expiration', async () => {
    await provider().createRequest(CREATE_INPUT);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);

    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].name).toBe('convention');
    expect(Buffer.from(body.documents[0].file, 'base64').toString()).toBe(
      '%PDF-1.7 fake convention',
    );
    expect(body.expire_at).toContain('2026-10-04');
  });

  it('remonte l’id de submission et les liens de signature', async () => {
    const res = await provider().createRequest(CREATE_INPUT);

    expect(res.providerId).toBe('42');
    expect(res.status).toBe('SENT');
    expect(res.signers).toEqual([
      expect.objectContaining({
        role: 'Client',
        email: 'dirigeant@agence.fr',
        providerSignerId: '501',
        signUrl: 'https://docuseal.test/s/pAMimKcyrLjqVt',
        signedAt: null,
      }),
      expect.objectContaining({
        role: 'Organisme de formation',
        providerSignerId: '502',
        signUrl: 'https://docuseal.test/s/zZz9',
      }),
    ]);
  });

  it('compte les champs signature créés par les ancres (D-7)', async () => {
    const res = await provider().createRequest(CREATE_INPUT);
    expect(res.signatureFieldCount).toBe(2);
  });

  it('un PDF sans ancre reconnue rend 0 champ — l’appelant doit pouvoir refuser', async () => {
    fetchMock.mockResolvedValue(jsonOk({ ...CREATE_RESPONSE, fields: [] }));
    const res = await provider().createRequest(CREATE_INPUT);
    expect(res.signatureFieldCount).toBe(0);
  });

  it('échoue bruyamment sur une réponse d’erreur, sans recracher la clé API', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'documents is invalid' }),
      text: async () => '{"error":"documents is invalid"}',
    });

    await expect(provider().createRequest(CREATE_INPUT)).rejects.toThrow(/422/);
    await expect(provider().createRequest(CREATE_INPUT)).rejects.not.toThrow(
      new RegExp(API_KEY),
    );
  });
});

describe('DocuSeal — cancel / remind', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonOk({ id: 42, status: 'archived' }));
  });

  it('cancel archive la submission', async () => {
    await provider().cancel('42');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/submissions/42`);
    expect(init.method).toBe('DELETE');
  });

  it('remind relance UN signataire précis', async () => {
    await provider().remind('42', '501');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/submitters/501`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body).send_email).toBe(true);
  });
});

describe('DocuSeal — getRequest / téléchargements', () => {
  const SUBMISSION = {
    id: 42,
    status: 'completed',
    completed_at: '2026-09-10T09:12:00.000Z',
    audit_log_url: 'https://docuseal.test/blobs/audit.pdf',
    combined_document_url: 'https://docuseal.test/blobs/combined.pdf',
    documents: [{ name: 'convention', url: 'https://docuseal.test/blobs/convention.pdf' }],
    // Relevé réel : GET /submissions/{id} ne renvoie PAS `embed_src`, seulement
    // `slug`. Le lien de signature doit donc être reconstruit — sinon le lot C
    // n'a rien à mettre dans son email de relance.
    submitters: [
      {
        id: 501,
        role: 'Client',
        name: 'Marie Dupont',
        email: 'dirigeant@agence.fr',
        status: 'completed',
        slug: 'pAMimKcyrLjqVt',
        completed_at: '2026-09-10T09:10:00.000Z',
      },
    ],
  };

  beforeEach(() => fetchMock.mockReset());

  it('getRequest mappe le statut DocuSeal vers le statut QualiOF', async () => {
    fetchMock.mockResolvedValue(jsonOk(SUBMISSION));
    const state = await provider().getRequest('42');

    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE_URL}/submissions/42`);
    expect(state.status).toBe('DONE');
    expect(state.completedAt?.toISOString()).toBe('2026-09-10T09:12:00.000Z');
    expect(state.auditTrailUrl).toBe('https://docuseal.test/blobs/audit.pdf');
    expect(state.documentUrls).toEqual(['https://docuseal.test/blobs/convention.pdf']);
  });

  it('reconstruit le lien de signature depuis le slug quand embed_src manque', async () => {
    fetchMock.mockResolvedValue(jsonOk(SUBMISSION));
    const state = await provider().getRequest('42');
    expect(state.signers[0]!.signUrl).toBe('https://docuseal.test/s/pAMimKcyrLjqVt');
  });

  it.each([
    ['pending', 'SENT'],
    ['declined', 'DECLINED'],
    ['expired', 'EXPIRED'],
    ['archived', 'CANCELED'],
  ])('mappe le statut « %s » en %s', async (docuseal, attendu) => {
    fetchMock.mockResolvedValue(jsonOk({ ...SUBMISSION, status: docuseal, completed_at: null }));
    expect((await provider().getRequest('42')).status).toBe(attendu);
  });

  it('downloadSignedDocument récupère les PDF signés', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOk(SUBMISSION))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('%PDF signed').buffer,
      });

    const docs = await provider().downloadSignedDocument('42');
    expect(docs).toHaveLength(1);
    expect(docs[0]!.name).toBe('convention');
    expect(docs[0]!.pdf.toString()).toBe('%PDF signed');
  });

  it('downloadAuditTrail récupère le certificat de signature (règle métier n°3)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOk(SUBMISSION))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('%PDF audit trail').buffer,
      });

    const pdf = await provider().downloadAuditTrail('42');
    expect(fetchMock.mock.calls[1]![0]).toBe('https://docuseal.test/blobs/audit.pdf');
    expect(pdf.toString()).toBe('%PDF audit trail');
  });

  it('downloadAuditTrail échoue si DocuSeal n’a pas (encore) produit de certificat', async () => {
    fetchMock.mockResolvedValue(jsonOk({ ...SUBMISSION, audit_log_url: null }));
    await expect(provider().downloadAuditTrail('42')).rejects.toThrow(/certificat/i);
  });
});

describe('DocuSeal — verifyWebhook', () => {
  const BODY = '{"event_type":"submission.completed","data":{"id":42}}';

  function sign(body: string, tsSeconds: number, secret = WEBHOOK_SECRET) {
    const sig = crypto.createHmac('sha256', secret).update(`${tsSeconds}.${body}`).digest('hex');
    return `${tsSeconds}.${sig}`;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T09:12:00.000Z'));
  });

  it('accepte une signature fraîche et valide', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(provider().verifyWebhook(BODY, { 'x-docuseal-signature': sign(BODY, now) })).toBe(true);
  });

  it('refuse un corps modifié après signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = sign(BODY, now);
    expect(provider().verifyWebhook(BODY.replace('42', '43'), { 'x-docuseal-signature': header })).toBe(
      false,
    );
  });

  it('refuse un rejeu de plus de 5 minutes', () => {
    const vieux = Math.floor(Date.now() / 1000) - 301;
    expect(provider().verifyWebhook(BODY, { 'x-docuseal-signature': sign(BODY, vieux) })).toBe(false);
  });

  it('refuse une signature calculée avec un autre secret', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      provider().verifyWebhook(BODY, { 'x-docuseal-signature': sign(BODY, now, 'whsec_autre') }),
    ).toBe(false);
  });

  it('refuse une requête sans en-tête de signature', () => {
    expect(provider().verifyWebhook(BODY, {})).toBe(false);
  });

  it('fail-closed : sans secret configuré, on refuse au lieu de tout accepter', () => {
    const sansSecret = createDocusealProvider({ apiKey: API_KEY, baseUrl: BASE_URL });
    const now = Math.floor(Date.now() / 1000);
    expect(sansSecret.verifyWebhook(BODY, { 'x-docuseal-signature': sign(BODY, now) })).toBe(false);
  });
});

describe('DocuSeal — parseEvent', () => {
  it('form.completed → un signataire a signé', () => {
    const ev = provider().parseEvent(
      JSON.stringify({
        event_type: 'form.completed',
        timestamp: '2026-09-10T09:10:00.000Z',
        data: { id: 501, submission_id: 42, email: 'dirigeant@agence.fr', external_id: 'signer-client' },
      }),
    );
    expect(ev.type).toBe('signer.completed');
    expect(ev.providerId).toBe('42');
    expect(ev.signerId).toBe('501');
    expect(ev.signerEmail).toBe('dirigeant@agence.fr');
  });

  it('form.completed réel : l’id de l’envoi est SOUS data.submission, pas data.submission_id', () => {
    // Payload documenté par la skill docuseal-code (references/api/form-webhook.md).
    // `data` ne porte PAS de `submission_id` : le lot C perdrait la corrélation
    // et ne saurait pas quel SignatureRequest avancer.
    const ev = provider().parseEvent(
      JSON.stringify({
        event_type: 'form.completed',
        timestamp: '2026-09-10T09:10:00.000Z',
        data: {
          id: 1,
          email: 'john.doe@example.com',
          role: 'Client',
          status: 'completed',
          completed_at: '2026-09-10T09:10:00.000Z',
          submission: {
            id: 12,
            audit_log_url: 'https://docuseal.test/blobs/audit-log.pdf',
            status: 'completed',
          },
        },
      }),
    );
    expect(ev.type).toBe('signer.completed');
    expect(ev.providerId).toBe('12');
    expect(ev.signerId).toBe('1');
    expect(ev.auditTrailUrl).toBe('https://docuseal.test/blobs/audit-log.pdf');
  });

  it('submission.completed → tout le monde a signé, certificat disponible', () => {
    const ev = provider().parseEvent(
      JSON.stringify({
        event_type: 'submission.completed',
        timestamp: '2026-09-10T09:12:00.000Z',
        data: { id: 42, status: 'completed', audit_log_url: 'https://docuseal.test/blobs/audit.pdf' },
      }),
    );
    expect(ev.type).toBe('request.completed');
    expect(ev.providerId).toBe('42');
    expect(ev.auditTrailUrl).toBe('https://docuseal.test/blobs/audit.pdf');
  });

  it('form.declined → refus de signature', () => {
    const ev = provider().parseEvent(
      JSON.stringify({
        event_type: 'form.declined',
        data: { id: 501, submission_id: 42, email: 'dirigeant@agence.fr' },
      }),
    );
    expect(ev.type).toBe('signer.declined');
    expect(ev.providerId).toBe('42');
  });

  it('événement inconnu → « unknown », jamais un throw (le webhook doit répondre 200)', () => {
    const ev = provider().parseEvent(
      JSON.stringify({ event_type: 'form.viewed', data: { id: 501, submission_id: 42 } }),
    );
    expect(ev.type).toBe('unknown');
  });

  it('corps illisible → throw explicite (le webhook répondra 400)', () => {
    expect(() => provider().parseEvent('pas du json')).toThrow(/payload/i);
  });
});
