/**
 * Port `SignatureProvider` — spec signature 2026-09-04 §5 lot B.
 *
 * Tout QualiOF parle À CE FICHIER, jamais à DocuSeal. Motif : décision O-2 —
 * « port pour pouvoir remplacer par Yousign si un jour un financeur exige un
 * prestataire français, ou par une implémentation native si DocuSeal
 * disparaît ». Même découpage que l'adaptateur de stockage (`lib/storage.ts`) :
 * une interface, N implémentations, zéro impact sur les call sites.
 *
 * Implémentations : `docuseal.ts` (réel) et `dry-run.ts` (local, sans réseau).
 * Sélection : `provider.ts` (fail-closed).
 */

/**
 * Statut d'une demande, aligné sur l'enum Prisma `SignatureRequestStatus`.
 * Volontairement une union de chaînes plutôt qu'un import Prisma : le port ne
 * doit rien savoir de la base.
 */
export type SignatureStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_SIGNED'
  | 'DONE'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELED';

/** Un PDF à faire signer — déjà rendu, ancres `{{…}}` comprises (D-7). */
export interface SignatureDocumentInput {
  /** Nom lisible : il apparaît côté signataire et dans le certificat. */
  name: string;
  pdf: Buffer;
}

/** Un signataire tel que QualiOF l'a résolu (règle métier n°4 : jamais deviné). */
export interface SignatureSignerInput {
  /** Rôle attendu par les ancres du PDF (`role=…`). */
  role: string;
  name: string;
  email: string;
  /** 0 signe en premier. D-3 : client (0) puis OF (1). */
  order: number;
}

export interface CreateSignatureRequestInput {
  /** Titre de l'envoi chez le prestataire (repris dans ses écrans et emails). */
  name: string;
  documents: SignatureDocumentInput[];
  signers: SignatureSignerInput[];
  /** `SignatureRequest.id` côté QualiOF — trace applicative de corrélation. */
  externalId: string;
  expiresAt?: Date | null;
}

export interface ProviderSigner {
  role: string;
  name: string;
  email: string;
  providerSignerId: string;
  /** Statut brut du prestataire (`sent`, `opened`, `completed`, …). */
  status: string;
  signedAt: Date | null;
  /**
   * Lien de signature. D-9 : `send_email: false` côté prestataire, c'est
   * QualiOF qui envoie l'email — sans ce lien, il n'a rien à envoyer.
   */
  signUrl: string | null;
}

export interface CreateSignatureRequestResult {
  providerId: string;
  status: SignatureStatus;
  signers: ProviderSigner[];
  expiresAt: Date | null;
}

export interface SignatureRequestState {
  providerId: string;
  status: SignatureStatus;
  signers: ProviderSigner[];
  completedAt: Date | null;
  /** URLs des PDF signés chez le prestataire. */
  documentUrls: string[];
  /** URL du certificat de signature (audit log) — règle métier n°3. */
  auditTrailUrl: string | null;
}

export interface SignedDocument {
  name: string;
  pdf: Buffer;
}

export type SignatureEventType =
  | 'signer.completed'
  | 'signer.declined'
  | 'request.completed'
  | 'request.expired'
  | 'unknown';

export interface SignatureEvent {
  type: SignatureEventType;
  /** Id de la demande chez le prestataire (= `SignatureRequest.providerId`). */
  providerId: string;
  signerId: string | null;
  signerEmail: string | null;
  auditTrailUrl: string | null;
  occurredAt: Date;
  /** Payload brut, pour l'AuditLog et le diagnostic d'un webhook inattendu. */
  raw: unknown;
}

export interface SignatureProvider {
  /** `docuseal` | `dry-run` — mémorisé sur `SignatureRequest.provider`. */
  readonly name: string;

  createRequest(input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult>;

  /**
   * Relit l'état chez le prestataire. Sert au filet du lot C (cron
   * `signature-sync` pour les webhooks perdus) et au retour du signé.
   */
  getRequest(providerId: string): Promise<SignatureRequestState>;

  cancel(providerId: string): Promise<void>;

  /** Relance UN signataire (le prestataire renvoie son email). */
  remind(providerId: string, signerId: string): Promise<void>;

  downloadSignedDocument(providerId: string): Promise<SignedDocument[]>;

  /** Le certificat de signature, pièce jointe du dossier AGEFICE (règle n°3). */
  downloadAuditTrail(providerId: string): Promise<Buffer>;

  /**
   * Vérifie l'authenticité d'un webhook. **Fail-closed** : en l'absence de
   * secret ou de signature, on refuse — jamais « true par défaut ».
   *
   * @param rawBody Les octets EXACTS reçus, pas un JSON re-sérialisé.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;

  /** Traduit un payload de webhook en événement du domaine. */
  parseEvent(rawBody: string): SignatureEvent;
}
