/**
 * Contrats partagés de la signature électronique (spec 2026-09-04 §4.2, §5 lot B).
 *
 * Deux contrats vivent ici parce que le serveur ET le client les lisent :
 *  1. `tenantSignatorySchema` (D-1) — le signataire OF configuré une fois dans
 *     Paramètres organisme. Champs vides autorisés : ils font retomber sur le
 *     responsable OF déjà connu (`OF_RESP_*` / of-config), pas de double saisie.
 *  2. `signatureSignersSchema` — le contenu de la colonne Json
 *     `SignatureRequest.signers`. Une colonne Json sans schéma est une dette :
 *     `parseSignatureSigners` est le seul point de lecture autorisé et il ne
 *     fait jamais tomber une page à cause d'une ligne mal formée.
 */

import { z } from 'zod';

/**
 * Ordre de signature (D-3). `AFTER` = l'OF signe après le client, c'est-à-dire
 * après avoir constaté que le client a bien signé — le comportement d'aujourd'hui.
 */
export const SIGNATORY_ORDERS = ['BEFORE', 'AFTER'] as const;
export type SignatoryOrder = (typeof SIGNATORY_ORDERS)[number];

/** D-1 — signataire OF, édité dans Paramètres organisme. */
export const tenantSignatorySchema = z.object({
  signatoryName: z
    .string()
    .max(120, 'Maximum 120 caractères')
    .nullable()
    .optional()
    .transform((s) => s ?? ''),
  signatoryEmail: z
    .string()
    .nullable()
    .optional()
    .transform((s) => (s ?? '').trim())
    // Vide volontaire = fallback ENV `OF_RESP_EMAIL` / `OF_EMAIL`.
    .pipe(z.string().email('Email invalide').or(z.literal(''))),
  signatoryTitle: z
    .string()
    .max(120, 'Maximum 120 caractères')
    .nullable()
    .optional()
    .transform((s) => s ?? ''),
  signatoryOrder: z.enum(SIGNATORY_ORDERS).default('AFTER'),
});

export type TenantSignatoryInput = z.infer<typeof tenantSignatorySchema>;

/**
 * Un signataire tel que mémorisé dans `SignatureRequest.signers`.
 *
 * `signedAt` est une chaîne ISO (et non un `Date`) : c'est du Json en base,
 * il traverse la frontière serveur → client sans sérialisation maison.
 */
export const signatureSignerSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  providerSignerId: z.string().min(1),
  status: z.string().min(1),
  signedAt: z.string().nullable(),
  signUrl: z.string().nullable(),
  /**
   * Lot C.3 — quand CE signataire a refusé de signer (`form.declined`).
   *
   * ⚠ OPTIONNEL AVEC DÉFAUT, et ce n'est pas un détail de style : c'est LA
   * règle de cette colonne. `parseSignatureSigners` écarte sans bruit ce qui ne
   * parse pas ; un champ REQUIS ajouté ici ferait disparaître, de tous les
   * écrans, les signataires de toutes les demandes déjà en base — écrites avant
   * que le champ existe. Sans erreur, sans log : juste un envoi qui n'a plus
   * aucun signataire. Tout champ ajouté après lui suit la même règle, et
   * `__tests__/signature.test.ts` garde le fait sur la forme à sept champs du
   * lot C.2a.
   */
  declinedAt: z.string().nullable().optional().default(null),
});

export const signatureSignersSchema = z.array(signatureSignerSchema);

export type SignatureSigner = z.infer<typeof signatureSignerSchema>;

/**
 * Relit la colonne Json en écartant — sans bruit — ce qui ne respecte pas le
 * contrat. Une fiche session ne doit jamais tomber en erreur parce qu'un
 * webhook a écrit une ligne inattendue.
 *
 * ⚠ C'est CE silence qui impose la règle du lot C.3 : tout champ ajouté à
 * `signatureSignerSchema` est optionnel avec défaut. Requis, il ferait
 * disparaître d'un coup toutes les lignes déjà en base — et le silence, ici,
 * jouerait contre nous.
 */
export function parseSignatureSigners(raw: unknown): SignatureSigner[] {
  if (!Array.isArray(raw)) return [];
  const out: SignatureSigner[] = [];
  for (const item of raw) {
    const parsed = signatureSignerSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ─── Moteur d'envoi en signature (lot C.2a-2) ────────────────────────────────

/**
 * Les deux moments d'envoi. AVANT la formation : convention + dossier de
 * financement. APRÈS : attestation d'assiduité.
 */
export const SCOPES_ENVOI = ['BEFORE', 'AFTER'] as const;
export type ScopeEnvoiInput = (typeof SCOPES_ENVOI)[number];

/**
 * Ouverture du récapitulatif d'envoi (décision Laurent, 10/09/2026).
 *
 * Cette action RÉGÉNÈRE : elle produit le PDF exact qui partira — avec ses
 * ancres — et rend son `hashSha256`. Ce n'est donc pas une lecture, et son
 * schéma vit ici comme celui d'une écriture.
 */
export const preparerEnvoiSignatureSchema = z.object({
  sessionId: z.string().uuid(),
  scope: z.enum(SCOPES_ENVOI),
  /** Sous-ensemble d'envois à préparer. Absent = tout le plan du moment choisi. */
  cles: z.array(z.string().min(1)).optional(),
});
export type PreparerEnvoiSignatureInput = z.infer<typeof preparerEnvoiSignatureSchema>;

/**
 * Une pièce confirmée par l'admin devant le récapitulatif.
 *
 * `hashConfirme` n'est PAS une commodité d'appel : c'est le contrôle qui rend
 * vraie la promesse « le clic confirme CE PDF-là ». Deux admins en parallèle,
 * ou une régénération déclenchée ailleurs entre l'aperçu et le clic, enverraient
 * sinon autre chose que ce qui a été relu. L'envoi REFUSE quand le hash a bougé.
 */
export const cibleEnvoiSignatureSchema = z.object({
  /** Clé stable du plan d'envoi : `CONVENTION:org-1`, `AGEFICE:part-3`. */
  cle: z.string().min(1),
  /** Le `Document.hashSha256` vu à l'aperçu — 64 caractères hexadécimaux. */
  hashConfirme: z.string().min(1, 'Hash du document confirmé manquant'),
  /**
   * Adresse saisie à la main par l'admin quand le signataire n'en a pas.
   * SEULE dérogation au « pas de repli sur un autre contact » : décision
   * humaine, assumée, et journalisée avec le nom retenu.
   */
  emailSaisi: z.string().trim().email('Adresse email invalide').optional(),
});
export type CibleEnvoiSignature = z.infer<typeof cibleEnvoiSignatureSchema>;

/**
 * Envoi effectif. Les cibles portent chacune SON hash : des tableaux parallèles
 * (`cles[]` + `hashes[]`) se désaligneraient un jour sans que rien ne le dise.
 */
export const sendForSignatureSchema = z.object({
  sessionId: z.string().uuid(),
  scope: z.enum(SCOPES_ENVOI),
  cibles: z
    .array(cibleEnvoiSignatureSchema)
    .min(1, 'Aucune pièce sélectionnée : rouvrez le récapitulatif et cochez ce qui doit partir.'),
  /** Réenvoyer une pièce déjà signée. Jamais implicite. */
  force: z.boolean().optional().default(false),
});
export type SendForSignatureInput = z.infer<typeof sendForSignatureSchema>;

/**
 * Annulation d'un envoi en cours (lot C.2b-bis).
 *
 * POURQUOI CETTE ACTION EXISTE. Un envoi réussi pose `Document.status =
 * 'sent_for_signature'`. Dès lors `preparerEnvoiSignature` refuse de régénérer
 * la pièce et `sendForSignature` refuse de la renvoyer (`ENVOI_EN_COURS`, que
 * `force` ne lève pas). Tant que le webhook du lot C.3 n'existe pas — et
 * personne n'ayant reçu de lien avant le lot C.2c —, la pièce est GELÉE sans
 * recours. `messageEnvoiEnCours` promettait d'ailleurs « Annulez l'envoi en
 * cours », un geste qui n'existait nulle part.
 *
 * L'entrée porte l'identifiant de la DEMANDE, pas celui du document : c'est la
 * demande qui est annulée chez le prestataire, et elle peut couvrir plusieurs
 * documents.
 */
export const MOTIFS_ANNULATION_SIGNATURE = ['user_requested', 'scan_deposited'] as const;
export type MotifAnnulationSignature = (typeof MOTIFS_ANNULATION_SIGNATURE)[number];

export const annulerEnvoiSignatureSchema = z.object({
  signatureRequestId: z.string().uuid(),
  /**
   * POURQUOI LE MOTIF EST UN CHAMP D'ENTRÉE (lot C.2b-3, Laurent 11/09/2026).
   *
   * Deux annulations ne se valent pas. L'une est volontaire : l'admin clique
   * « Annuler l'envoi ». L'autre est PROVOQUÉE par le dépôt d'un scan signé sur
   * la même pièce — « une pièce, un seul chemin ouvert ». Sans le motif, elles
   * produisent la même ligne de journal, et c'est pourtant la première question
   * qu'un auditeur pose devant deux preuves d'une même pièce : pourquoi la
   * signature électronique s'est-elle arrêtée ?
   *
   * Une ÉNUMÉRATION, pas du texte libre : le journal doit rester interrogeable.
   * Une valeur par défaut, pour que l'appelant existant (le bouton du bloc
   * « Signature ») n'ait rien à préciser.
   */
  motif: z.enum(MOTIFS_ANNULATION_SIGNATURE).optional().default('user_requested'),
});
export type AnnulerEnvoiSignatureInput = z.infer<typeof annulerEnvoiSignatureSchema>;

/* ── La cloche — une pièce signée par TOUS (lot C.3, défaut D-C3-2) ────────── */

/**
 * Le payload de `Notification.payload` pour `type = 'signature.completed'`.
 *
 * Écrit par `prevenirAdmins` (`server/signature-retour.ts`) quand le webhook
 * `submission.completed` a ramené le PDF signé ET son certificat ; relu par
 * `getNotifications()` pour composer la ligne de la cloche. UNE source pour les
 * deux côtés : c'est ce qui évite le drift d'une colonne Json sans schéma.
 *
 * ⚠ MÊME RÈGLE QUE `signatureSignerSchema` : tout champ ajouté après coup est
 * OPTIONNEL avec valeur par défaut. Les lignes déjà en base ont été écrites
 * avant, et un lecteur qui les refuse ne lève pas d'erreur — il rend une cloche
 * vide. `sessionId` et `docType` font exception : sans eux la notification n'a
 * ni destination ni libellé, et l'écarter est le bon comportement.
 */
export const SignatureCompletedPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  /**
   * `Document.type` tel quel — String et non enum : la table des pièces
   * signables vit côté application (`DOC_TYPES_SIGNABLES`), et une valeur
   * inconnue doit produire un libellé neutre, pas une notification écartée.
   */
  docType: z.string().min(1),
  /** Le code affiché à l'admin (« SES-0048 »). Absent ⇒ la phrase s'arrête. */
  sessionCode: z.string().min(1).nullable().optional().default(null),
});
export type SignatureCompletedPayload = z.infer<typeof SignatureCompletedPayloadSchema>;
