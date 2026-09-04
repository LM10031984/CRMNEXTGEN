/**
 * Provider `dry-run` (spec 2026-09-04 §5 lot B).
 *
 * Même raison d'être que `MAIL_DRY_RUN` pour le mailer : dérouler toute la
 * chaîne — envoi, attente, webhook, retour du signé, certificat — SANS clé
 * DocuSeal et SANS le moindre paquet réseau. La règle du chantier est
 * explicite : « sans clé, provider dry-run obligatoire, jamais d'appel réseau
 * silencieux ».
 *
 * `simulateCompletion()` remplace le clic du signataire : c'est ce que la
 * route dev du lot C appellera pour démontrer le retour du PDF signé en local.
 *
 * L'état vit en mémoire du processus : il disparaît au redémarrage, ce qui est
 * exactement ce qu'on veut d'un bac à sable.
 */

import crypto from 'node:crypto';
import type {
  CreateSignatureRequestInput,
  CreateSignatureRequestResult,
  ProviderSigner,
  SignatureEvent,
  SignatureProvider,
  SignatureRequestState,
  SignatureStatus,
  SignedDocument,
} from './port';

/** Provider dry-run + le levier de simulation (absent du port réel). */
export interface DryRunSignatureProvider extends SignatureProvider {
  /** Simule la signature de tous les signataires d'un envoi. */
  simulateCompletion(providerId: string): void;
}

interface DryRunRequest {
  providerId: string;
  name: string;
  signers: ProviderSigner[];
  documents: Array<{ name: string; pdf: Buffer }>;
  status: SignatureStatus;
  completedAt: Date | null;
  expiresAt: Date | null;
}

/** PDF minimal mais VALIDE : il doit s'ouvrir dans un lecteur, pas juste exister. */
function fakePdf(titre: string): Buffer {
  const texte = titre.replace(/[()\\]/g, '');
  const contenu = `BT /F1 14 Tf 60 720 Td (${texte}) Tj ET`;
  const objets = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${contenu.length} >> stream\n${contenu}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of objets) {
    offsets.push(pdf.length);
    pdf += `${o}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf +=
    `trailer << /Size ${objets.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

export function createDryRunProvider(): DryRunSignatureProvider {
  const store = new Map<string, DryRunRequest>();

  function get(providerId: string): DryRunRequest {
    const r = store.get(providerId);
    if (!r) throw new Error(`dry-run : envoi ${providerId} inconnu`);
    return r;
  }

  return {
    name: 'dry-run',

    async createRequest(input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult> {
      const providerId = `dry-run-${crypto.randomUUID()}`;

      const signers: ProviderSigner[] = [...input.signers]
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({
          role: s.role,
          name: s.name,
          email: s.email,
          providerSignerId: `${providerId}-s${i}`,
          status: i === 0 ? 'sent' : 'awaiting',
          signedAt: null,
          // Lien inerte : il ne mène nulle part, mais il prouve que la chaîne
          // « QualiOF envoie l'email » (D-9) transporte bien un lien.
          signUrl: `/app/dev/signature/${providerId}/s${i}`,
        }));

      store.set(providerId, {
        providerId,
        name: input.name,
        signers,
        documents: input.documents.map((d) => ({ name: d.name, pdf: d.pdf })),
        status: 'SENT',
        completedAt: null,
        expiresAt: input.expiresAt ?? null,
      });

      return { providerId, status: 'SENT', signers, expiresAt: input.expiresAt ?? null };
    },

    async getRequest(providerId: string): Promise<SignatureRequestState> {
      const r = store.get(providerId);
      if (!r) {
        // Un envoi inconnu (processus redémarré) est traité comme expiré plutôt
        // que comme une erreur : le cron du lot C ne doit pas boucler dessus.
        return {
          providerId,
          status: 'EXPIRED',
          signers: [],
          completedAt: null,
          documentUrls: [],
          auditTrailUrl: null,
        };
      }
      return {
        providerId,
        status: r.status,
        signers: r.signers,
        completedAt: r.completedAt,
        documentUrls: r.documents.map((d) => `dry-run://${providerId}/${d.name}`),
        auditTrailUrl: r.status === 'DONE' ? `dry-run://${providerId}/audit-trail` : null,
      };
    },

    async cancel(providerId: string): Promise<void> {
      const r = store.get(providerId);
      if (r) r.status = 'CANCELED';
    },

    async remind(_providerId: string, _signerId: string): Promise<void> {
      // Rien à faire : en dry-run, aucun email n'a jamais été envoyé.
    },

    async downloadSignedDocument(providerId: string): Promise<SignedDocument[]> {
      const r = get(providerId);
      if (r.status !== 'DONE') {
        throw new Error(`dry-run : envoi ${providerId} pas encore signé`);
      }
      return r.documents.map((d) => ({
        name: d.name,
        pdf: fakePdf(`[DRY-RUN] ${d.name} signe`),
      }));
    },

    async downloadAuditTrail(providerId: string): Promise<Buffer> {
      const r = get(providerId);
      if (r.status !== 'DONE') {
        throw new Error(`dry-run : envoi ${providerId} pas encore signé`);
      }
      return fakePdf(`[DRY-RUN] Certificat de signature ${providerId}`);
    },

    verifyWebhook(): boolean {
      // Aucun secret en local : le webhook simulé est forcément le nôtre.
      return true;
    },

    parseEvent(rawBody: string): SignatureEvent {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        throw new Error('dry-run : payload de webhook illisible (JSON invalide)');
      }
      const data = (payload.data ?? {}) as Record<string, unknown>;
      const eventType = String(payload.event_type ?? '');

      return {
        type:
          eventType === 'submission.completed'
            ? 'request.completed'
            : eventType === 'form.completed'
              ? 'signer.completed'
              : eventType === 'form.declined'
                ? 'signer.declined'
                : 'unknown',
        providerId: String(data.submission_id ?? data.id ?? ''),
        signerId: data.id === undefined ? null : String(data.id),
        signerEmail: data.email === undefined ? null : String(data.email),
        auditTrailUrl: null,
        occurredAt: new Date(),
        raw: payload,
      };
    },

    simulateCompletion(providerId: string): void {
      const r = get(providerId);
      const now = new Date();
      r.status = 'DONE';
      r.completedAt = now;
      r.signers = r.signers.map((s) => ({ ...s, status: 'completed', signedAt: now }));
    },
  };
}
