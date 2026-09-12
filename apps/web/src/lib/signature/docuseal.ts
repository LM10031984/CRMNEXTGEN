/**
 * Adaptateur DocuSeal (spec 2026-09-04 §5 lot B, décision O-2).
 *
 * Seul fichier de QualiOF qui connaît DocuSeal. Tout le reste passe par le port
 * `SignatureProvider`.
 *
 * Pourquoi DocuSeal : Yousign facturait 104 € HT/mois pour 500 signatures ;
 * DocuSeal ≈ 20 $/utilisateur/mois, signatures illimitées, ET — c'est le point
 * décisif — il produit un **certificat de signature** (audit log : email
 * vérifié, horodatages, IP, id d'enveloppe) que les AGEFICE réclament. Une page
 * de preuve maison serait refusée par le financeur.
 *
 * Choix d'API : `POST /submissions/pdf` — création d'un envoi « one-off » à
 * partir du PDF déjà rendu par WeasyPrint, sans passer par un Template DocuSeal
 * à maintenir en double. Les champs sont posés par les ancres `{{…}}` (D-7).
 *
 * Emails : `send_email: false` partout (D-9). C'est QualiOF qui écrit aux
 * signataires, via son mailer fail-closed et sa catégorie décochable.
 *
 * Documentation : https://www.docuseal.com/docs/api — spécification OpenAPI
 * https://console.docuseal.com/openapi.yml (vérifiée le 04/09/2026).
 */

import crypto from 'node:crypto';
import type {
  CreateSignatureRequestInput,
  CreateSignatureRequestResult,
  ProviderSigner,
  SignatureEvent,
  SignatureEventType,
  SignatureProvider,
  SignatureRequestState,
  SignatureStatus,
  SignedDocument,
} from './port';

export interface DocusealConfig {
  apiKey: string;
  /** `https://api.docuseal.com` (global) ou `https://api.docuseal.eu` (UE). */
  baseUrl: string;
  /** Secret HMAC des webhooks (`whsec_…`). Absent ⇒ aucun webhook accepté. */
  webhookSecret?: string | undefined;
}

/** Fenêtre de rejeu tolérée sur la signature des webhooks. */
const WEBHOOK_TOLERANCE_SEC = 300;

/** Statuts d'une submission DocuSeal → statuts QualiOF. */
const STATUS_MAP: Record<string, SignatureStatus> = {
  pending: 'SENT',
  completed: 'DONE',
  declined: 'DECLINED',
  expired: 'EXPIRED',
  archived: 'CANCELED',
};

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json {
  return v && typeof v === 'object' ? (v as Json) : {};
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function date(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Host des liens de signature, déduit du host d'API : `api.docuseal.com` →
 * `docuseal.com`, `api.docuseal.eu` → `docuseal.eu`. Nécessaire parce que
 * `GET /submissions/{id}` ne renvoie PAS `embed_src` (relevé le 04/09/2026),
 * seulement `slug` — et sans lien, le lot C n'a rien à envoyer (D-9).
 */
function signHost(baseUrl: string): string {
  return baseUrl.replace(/\/\/api\./, '//');
}

function mapSigner(raw: unknown, baseUrl: string): ProviderSigner {
  const s = asRecord(raw);
  const slug = str(s.slug);
  return {
    role: str(s.role) ?? '',
    name: str(s.name) ?? '',
    email: str(s.email) ?? '',
    providerSignerId: str(s.id) ?? '',
    status: str(s.status) ?? 'sent',
    signedAt: date(s.completed_at),
    signUrl: str(s.embed_src) ?? (slug ? `${signHost(baseUrl)}/s/${slug}` : null),
  };
}

/**
 * Un envoi partiellement signé n'a pas de statut dédié chez DocuSeal (il reste
 * `pending`). QualiOF le distingue pour afficher « 1 signataire sur 2 ».
 */
function refineStatus(base: SignatureStatus, signers: ProviderSigner[]): SignatureStatus {
  if (base !== 'SENT') return base;
  const signes = signers.filter((s) => s.signedAt !== null).length;
  if (signes > 0 && signes < signers.length) return 'PARTIALLY_SIGNED';
  return base;
}

export function createDocusealProvider(config: DocusealConfig): SignatureProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function call(path: string, init: { method: string; body?: string }): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        'X-Auth-Token': config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(init.body === undefined ? {} : { body: init.body }),
    });

    if (!res.ok) {
      // Le corps d'erreur DocuSeal ne contient jamais la clé — mais on tronque
      // par principe : ce message finit dans `SignatureRequest.lastError`.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`DocuSeal ${init.method} ${path} → HTTP ${res.status} : ${detail}`);
    }
    return res.json();
  }

  async function getSubmission(providerId: string): Promise<Json> {
    return asRecord(await call(`/submissions/${providerId}`, { method: 'GET' }));
  }

  /** Télécharge une URL de blob DocuSeal (déjà signée, pas d'en-tête à poser). */
  async function fetchBlob(url: string): Promise<Buffer> {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`DocuSeal : téléchargement ${url} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  function toState(sub: Json): SignatureRequestState {
    const signers = (Array.isArray(sub.submitters) ? sub.submitters : []).map((x) =>
      mapSigner(x, baseUrl),
    );
    const base = STATUS_MAP[str(sub.status) ?? ''] ?? 'SENT';
    const documents = Array.isArray(sub.documents) ? sub.documents : [];

    return {
      providerId: str(sub.id) ?? '',
      status: refineStatus(base, signers),
      signers,
      completedAt: date(sub.completed_at),
      documentUrls: documents
        .map((d) => str(asRecord(d).url))
        .filter((u): u is string => u !== null),
      auditTrailUrl: str(sub.audit_log_url),
    };
  }

  return {
    name: 'docuseal',

    async createRequest(input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult> {
      const submitters = [...input.signers]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          role: s.role,
          name: s.name,
          email: s.email,
          order: s.order,
          external_id: `${input.externalId}:${s.role}`,
          // D-9 — QualiOF envoie les emails, pas DocuSeal.
          send_email: false,
          send_sms: false,
          // Le certificat de signature part au dossier AGEFICE : un financeur
          // français doit pouvoir le lire. DocuSeal le compose dans la langue
          // du **dernier signataire ayant complété** — d'où la pose sur chaque
          // signataire, sans quoi le résultat dépendrait de l'ordre réel des
          // signatures. Portée : les libellés seulement. Les horodatages, eux,
          // suivent la langue du COMPTE, réglée à la main dans
          // console.docuseal.eu — voir docs/rgpd/dpa/docuseal.md.
          metadata: { lang: 'fr-FR' },
        }));

      const body: Json = {
        name: input.name,
        // D-9, au niveau de l'envoi comme au niveau de chaque signataire.
        send_email: false,
        // D-3 — le second signataire n'est sollicité qu'après le premier.
        order: 'preserved',
        documents: input.documents.map((d) => ({
          name: d.name,
          file: d.pdf.toString('base64'),
        })),
        submitters,
      };
      if (input.expiresAt) body.expire_at = input.expiresAt.toISOString();

      const res = await call('/submissions/pdf', { method: 'POST', body: JSON.stringify(body) });

      // Forme RÉELLE (relevée le 04/09/2026) : `POST /submissions/pdf` répond
      // un OBJET `{ id, submitters, fields, status }`. L'exemple de la spec
      // OpenAPI publiée laisse croire à un tableau — c'est la forme de
      // `POST /submissions` (depuis un Template). On accepte les deux.
      const obj = asRecord(res);
      const rows = Array.isArray(res)
        ? res
        : Array.isArray(obj.submitters)
          ? obj.submitters
          : [];
      const signers = rows.map((x) => mapSigner(x, baseUrl));

      const providerId = str(obj.id) ?? str(asRecord(rows[0]).submission_id);
      if (!providerId) {
        throw new Error('DocuSeal : réponse sans identifiant de submission — envoi non confirmé');
      }

      // Les ancres ont-elles produit des champs ? Un envoi à zéro champ
      // signature part sans que personne n'ait rien à signer : l'appelant doit
      // pouvoir le refuser (cf. `signatureFieldCount` sur le port).
      const fields = Array.isArray(obj.fields) ? obj.fields : [];
      const signatureFieldCount = fields.filter(
        (f) => str(asRecord(f).type) === 'signature',
      ).length;

      return {
        providerId,
        status: refineStatus(STATUS_MAP[str(obj.status) ?? ''] ?? 'SENT', signers),
        signers,
        expiresAt: input.expiresAt ?? null,
        signatureFieldCount,
      };
    },

    async getRequest(providerId: string): Promise<SignatureRequestState> {
      return toState(await getSubmission(providerId));
    },

    async cancel(providerId: string): Promise<void> {
      // DocuSeal n'a pas d'annulation : l'archivage retire l'envoi des
      // signataires et fige la submission.
      await call(`/submissions/${providerId}`, { method: 'DELETE' });
    },

    async remind(_providerId: string, signerId: string): Promise<void> {
      // La relance est propre au signataire : re-notifier tout l'envoi
      // enverrait un mail à quelqu'un qui a déjà signé.
      await call(`/submitters/${signerId}`, {
        method: 'PUT',
        body: JSON.stringify({ send_email: true }),
      });
    },

    async downloadSignedDocument(providerId: string): Promise<SignedDocument[]> {
      const sub = await getSubmission(providerId);
      const documents = Array.isArray(sub.documents) ? sub.documents : [];
      if (documents.length === 0) {
        throw new Error(`DocuSeal : aucun document signé sur l'envoi ${providerId}`);
      }

      const out: SignedDocument[] = [];
      for (const d of documents) {
        const doc = asRecord(d);
        const url = str(doc.url);
        if (!url) continue;
        out.push({ name: str(doc.name) ?? 'document', pdf: await fetchBlob(url) });
      }
      return out;
    },

    async downloadAuditTrail(providerId: string): Promise<Buffer> {
      const sub = await getSubmission(providerId);
      const url = str(sub.audit_log_url);
      if (!url) {
        throw new Error(
          `DocuSeal : pas de certificat de signature sur l'envoi ${providerId} ` +
            '(non terminé, ou certificat pas encore produit)',
        );
      }
      return fetchBlob(url);
    },

    verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
      // Fail-closed : sans secret configuré, on ne fait confiance à personne.
      if (!config.webhookSecret) return false;

      const header = headers['x-docuseal-signature'] ?? headers['X-Docuseal-Signature'];
      if (!header) return false;

      const sep = header.indexOf('.');
      if (sep <= 0) return false;
      const timestamp = header.slice(0, sep);
      const signature = header.slice(sep + 1);
      if (!/^\d+$/.test(timestamp) || !signature) return false;

      // Anti-rejeu : une signature valable capturée hier ne doit pas rejouer.
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SEC) return false;

      const expected = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      // Comparaison à temps constant — et longueurs égales exigées, sinon
      // `timingSafeEqual` lève au lieu de rendre false.
      if (expected.length !== signature.length) return false;
      try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
      } catch {
        return false;
      }
    },

    parseEvent(rawBody: string): SignatureEvent {
      let payload: Json;
      try {
        payload = asRecord(JSON.parse(rawBody));
      } catch {
        throw new Error('DocuSeal : payload de webhook illisible (JSON invalide)');
      }

      const eventType = str(payload.event_type) ?? '';
      const data = asRecord(payload.data);
      const submission = asRecord(data.submission);

      const type: SignatureEventType =
        eventType === 'form.completed'
          ? 'signer.completed'
          : eventType === 'form.declined'
            ? 'signer.declined'
            : eventType === 'submission.completed'
              ? 'request.completed'
              : eventType === 'submission.expired'
                ? 'request.expired'
                : 'unknown';

      // Les événements `form.*` portent un submitter (l'envoi est
      // `submission_id`) ; les `submission.*` portent l'envoi lui-même (`id`).
      const providerId =
        str(data.submission_id) ?? str(submission.id) ?? (eventType.startsWith('submission.') ? str(data.id) : null);

      return {
        type,
        providerId: providerId ?? '',
        signerId: eventType.startsWith('form.') ? str(data.id) : null,
        signerEmail: str(data.email),
        auditTrailUrl: str(data.audit_log_url) ?? str(submission.audit_log_url),
        occurredAt: date(payload.timestamp) ?? new Date(),
        raw: payload,
      };
    },
  };
}
