/**
 * Facturation électronique — le port. Aucune plateforme derrière ce fichier.
 *
 * Il décrit ce dont QualiOF a besoin, pas ce que Super PDP sait faire. Le jour
 * où l'on bascule sur Iopole, c'est une classe qu'on remplace, pas une refonte.
 * Règle : `port.ts` n'importe jamais `fetch`, et aucun `if (provider === …)` ne
 * vit hors d'un adaptateur.
 *
 * ── Ce que la doc réelle a changé par rapport à la spec du 02/09 ──────────
 *
 * La spec prévoyait `parseWebhook()`. **Super PDP n'expose aucun webhook**
 * (documentation et OpenAPI 1.30.0.beta lus le 03/09/2026). Le mécanisme
 * officiel est le POLLING sur une séquence d'ids strictement croissante :
 * `pollEvents({ startingAfterId })`. On ne garde pas une méthode morte « au cas
 * où » — une interface qui décrit une capacité inexistante ment à ses lecteurs.
 *
 * La spec prévoyait aussi une simple clé d'API. C'est OAuth 2.1
 * client_credentials, jeton de 30 minutes : la gestion du jeton appartient à
 * l'adaptateur, le port n'en sait rien.
 *
 * Enfin, la validation n'est pas une option de confort : la plateforme impose
 * `POST /validation_reports` AVANT `POST /invoices`. `validate()` est donc une
 * étape du chemin nominal, pas un outil de mise au point.
 */

/** Ce qu'on envoie : un fichier, son type MIME, et de quoi le retrouver. */
export interface EInvoiceDocument {
  /** Contenu exact transmis — jamais une régénération au moment de l'envoi. */
  content: Buffer;
  /** `application/pdf` (Factur-X) ou `application/xml` (CII / UBL). */
  contentType: 'application/pdf' | 'application/xml';
  /** Notre numéro de facture, repris comme `external_id` côté plateforme. */
  externalId: string;
}

export interface ValidationIssue {
  severity: 'fatal' | 'error' | 'warning';
  /** Règle EN 16931 / schematron, telle que rendue par la plateforme. */
  code: string | null;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  /** Réponse brute, conservée : en cas de litige elle fait foi, pas notre lecture. */
  raw: unknown;
}

export interface SubmitResult {
  /** Id de la facture côté plateforme (int64 → texte, `Number` le tronquerait). */
  externalId: string;
  raw: unknown;
}

/**
 * Un événement de cycle de vie tel que la plateforme le rend.
 *
 * `providerCode` est conservé à côté du statut normalisé : le mapping vers
 * `EInvoiceStatus` est une interprétation, le code d'origine doit rester
 * relisible six mois plus tard.
 */
export interface PlatformEvent {
  /** Id de l'événement (int64 → texte). Sert de curseur. */
  id: string;
  invoiceExternalId: string;
  /** `api:validated`, `fr:205`, `ppf:refused`… */
  providerCode: string;
  statusText: string | null;
  occurredAt: Date;
  raw: unknown;
}

export interface DirectoryEntry {
  siren: string;
  scheme: string | null;
  address: string | null;
  legalName: string | null;
}

export interface EInvoicePlatform {
  /** Nom stocké dans `EInvoiceTransmission.provider`. */
  readonly name: string;

  /** Test de connexion — ne transmet rien. */
  ping(): Promise<{ ok: boolean; detail?: string }>;

  /** Gate obligatoire avant `submit`. */
  validate(doc: EInvoiceDocument): Promise<ValidationReport>;

  /**
   * Dépose la facture. Un retour positif signifie « structure acceptée et mise
   * en file », PAS « conforme » ni « transmise » : la suite se lit dans les
   * événements. Ne jamais afficher « transmise » sur la foi de ce retour.
   */
  submit(doc: EInvoiceDocument): Promise<SubmitResult>;

  /**
   * Événements depuis un curseur. La séquence d'ids étant strictement
   * croissante, repartir du dernier id connu ne peut pas laisser de trou.
   * `hasMore` indique qu'il faut rappeler avec le dernier id rendu.
   */
  pollEvents(input: {
    startingAfterId?: string | null;
    invoiceExternalId?: string | null;
    limit?: number;
  }): Promise<{ events: PlatformEvent[]; hasMore: boolean }>;

  /**
   * Le client est-il joignable électroniquement ? Liste vide = il ne l'est
   * pas, et on reste sur l'envoi du PDF par email.
   */
  lookupDirectory(siren: string): Promise<DirectoryEntry[]>;
}
