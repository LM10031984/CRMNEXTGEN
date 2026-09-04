/**
 * Ce qu'une facture FIGE au moment de l'émission — lignes, parties, empreinte.
 *
 * Module PUR (zéro import Prisma), comme `lib/docs/source-fingerprint.ts` dont
 * il réutilise les primitives. Le chargement de la donnée vit dans
 * `server/actions/invoices.ts` ; ici on ne fait que projeter.
 *
 * ── Pourquoi figer ────────────────────────────────────────────────────────
 *
 * Aujourd'hui le PDF de facture est rendu depuis des données VIVANTES : si la
 * raison sociale du payeur change après coup, le document déjà envoyé et la
 * base ne racontent plus la même histoire, et rien ne le signale. C'est
 * l'écart E-1 de l'audit du 28/08. Sur une facture, il ne s'agit plus d'un
 * document à régénérer : c'est une pièce comptable, bientôt transmise à une
 * plateforme d'État. `InvoiceParty` est donc un SNAPSHOT, pas une FK vivante —
 * délibérément non relié à `Organization`.
 *
 * ── Trois conventions à connaître avant de toucher à ce fichier ──────────
 *
 * 1. QUANTITÉ 1, UNITÉ C62. Le prix de QualiOF est une place de formation
 *    (`SessionParticipant.priceHT`), pas un tarif horaire. Mettre la durée en
 *    quantité avec l'unité HUR ferait dire à la facture un prix unitaire que
 *    personne n'a négocié.
 *
 * 2. LIGNE D'AVOIR NÉGATIVE. `Invoice.amountHT` d'un avoir est stocké négatif
 *    dans ce dépôt ; les lignes suivent, sinon le contrat
 *    `amountHT === Σ lines.totalHT` serait faux dès le premier avoir.
 *    ⚠ L'EN 16931 fait l'inverse : un avoir y porte des montants POSITIFS, le
 *    signe étant porté par le `TypeCode 381`. La bascule appartient au builder
 *    du lot 2 (`builder/invoice-to-en16931.ts`), pas au stockage.
 *
 * 3. `vatExemptionReasonCode` RESTE NULL. La décision D-2 (code VATEX de
 *    l'art. 261-4-4°a) n'est pas tranchée. On porte la catégorie E et le texte
 *    de la mention ; on n'invente pas un code fiscal.
 */

import { computeFingerprint } from '@/lib/docs/source-fingerprint';

// ─── Identifiants ─────────────────────────────────────────────────────────

/** Chiffres seuls — la saisie humaine met des espaces, la base non. */
function chiffres(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * SIREN du tiers — nouvelle mention obligatoire de la réforme.
 *
 * Dérivé des 9 premiers chiffres du SIRET quand il manque : un SIRET est un
 * SIREN suivi d'un NIC de 5 chiffres, la dérivation est exacte et ne devine
 * rien. Sans SIREN NI SIRET exploitable, on rend `null` — c'est l'appelant qui
 * décide s'il bloque, pas ce module.
 */
export function resolveSiren(input: {
  siren?: string | null;
  siret?: string | null;
}): string | null {
  const s = chiffres(input.siren);
  if (s.length === 9) return s;
  const siret = chiffres(input.siret);
  if (siret.length >= 9) return siret.slice(0, 9);
  return null;
}

/** Message d'erreur d'émission — il nomme le tiers et dit quoi corriger. */
export function missingBuyerSirenError(legalName: string): string {
  return (
    `Impossible d'émettre : « ${legalName} » n'a ni SIREN ni SIRET. ` +
    `Le SIREN du client est une mention obligatoire de la facture depuis 2026. ` +
    `Complétez la fiche de l'organisation, puis relancez la facturation.`
  );
}

// ─── Adresses ─────────────────────────────────────────────────────────────

interface AdresseLue {
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
}

/**
 * `Organization.address` et `Location.address` sont du Json libre, et le dépôt
 * porte les deux orthographes ({street, postalCode, city} et {street, cp,
 * ville} — cf. `of-config.ts`). On lit les deux plutôt que d'en imposer une :
 * une migration de forme d'adresse ne doit pas vider silencieusement le SIREN
 * d'une facture.
 */
function lireAdresse(json: unknown): AdresseLue {
  const a = (json ?? null) as Record<string, unknown> | null;
  const str = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = a?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  return {
    addressLine1: str('street', 'addressLine1', 'line1'),
    postalCode: str('postalCode', 'cp', 'zip'),
    city: str('city', 'ville'),
  };
}

// ─── Parties ──────────────────────────────────────────────────────────────

export type InvoicePartyRoleName = 'SELLER' | 'BUYER' | 'DELIVERY';

export interface PartySnapshot {
  role: InvoicePartyRoleName;
  legalName: string;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  email: string | null;
  electronicAddressScheme: string | null;
  electronicAddress: string | null;
}

/** Schéma d'annuaire de la réforme : 0225 = SIREN France, 0002 = SIRET. */
const SCHEME_SIREN_FR = '0225';

function adresseElectronique(siren: string | null): Pick<
  PartySnapshot,
  'electronicAddressScheme' | 'electronicAddress'
> {
  // Pas de SIREN ⇒ pas d'adresse d'annuaire, et ça se voit. Fabriquer une
  // adresse depuis autre chose reviendrait à annoncer joignable un tiers qui
  // ne l'est pas — le lot 3 s'en apercevrait au moment de l'envoi.
  if (!siren) return { electronicAddressScheme: null, electronicAddress: null };
  return { electronicAddressScheme: SCHEME_SIREN_FR, electronicAddress: siren };
}

export interface SellerSource {
  legalName: string;
  siret: string | null;
  siren: string | null;
  vatNumber: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
}

export function buildSellerParty(src: SellerSource): PartySnapshot {
  const siren = resolveSiren(src);
  return {
    role: 'SELLER',
    legalName: src.legalName,
    siren,
    siret: chiffres(src.siret) || null,
    vatNumber: src.vatNumber?.trim() || null,
    addressLine1: src.addressLine1?.trim() || null,
    addressLine2: null,
    postalCode: src.postalCode?.trim() || null,
    city: src.city?.trim() || null,
    countryCode: 'FR',
    email: src.email?.trim() || null,
    ...adresseElectronique(siren),
  };
}

export interface BuyerSource {
  legalName: string;
  siret: string | null;
  siren: string | null;
  vatNumber: string | null;
  address: unknown;
  email: string | null;
}

export function buildBuyerParty(src: BuyerSource): PartySnapshot {
  const siren = resolveSiren(src);
  const adr = lireAdresse(src.address);
  return {
    role: 'BUYER',
    legalName: src.legalName,
    siren,
    siret: chiffres(src.siret) || null,
    vatNumber: src.vatNumber?.trim() || null,
    addressLine1: adr.addressLine1,
    addressLine2: null,
    postalCode: adr.postalCode,
    city: adr.city,
    countryCode: 'FR',
    email: src.email?.trim() || null,
    ...adresseElectronique(siren),
  };
}

export interface DeliverySource {
  name: string | null;
  legalName: string | null;
  address: unknown;
}

/**
 * Lieu de formation — l'« adresse de livraison » de la réforme quand elle
 * diffère de l'adresse de facturation, ce qui est le cas ordinaire pour un OF
 * (on ne forme presque jamais au siège du payeur).
 *
 * Rend `null` quand on ne sait rien du lieu : une partie DELIVERY vide vaudrait
 * moins qu'aucune, et l'absence est un aveu lisible.
 */
export function buildDeliveryParty(src: DeliverySource | null): PartySnapshot | null {
  if (!src) return null;
  const adr = lireAdresse(src.address);
  const nom = src.legalName?.trim() || src.name?.trim() || null;
  if (!nom && !adr.addressLine1 && !adr.city) return null;
  return {
    role: 'DELIVERY',
    legalName: nom ?? (adr.city as string),
    siren: null,
    siret: null,
    vatNumber: null,
    addressLine1: adr.addressLine1,
    addressLine2: null,
    postalCode: adr.postalCode,
    city: adr.city,
    countryCode: 'FR',
    email: null,
    electronicAddressScheme: null,
    electronicAddress: null,
  };
}

/**
 * `Invoice.deliveryAddressJson` — la colonne que la spec demande, DÉRIVÉE de la
 * partie DELIVERY et jamais construite en parallèle.
 *
 * Deux écritures indépendantes de la même adresse seraient exactement le piège
 * déjà présent sur le PDF de facture (`Invoice.pdfUrl` + `Document.pdfUrl`, deux
 * lignes à tenir synchrones). Ici il n'y a qu'une source : la partie. La
 * colonne n'est qu'une lecture sans jointure.
 */
export function deliveryAddressJson(
  party: PartySnapshot | null,
): Record<string, unknown> | null {
  if (!party) return null;
  return {
    legalName: party.legalName,
    addressLine1: party.addressLine1,
    postalCode: party.postalCode,
    city: party.city,
    countryCode: party.countryCode,
  };
}

// ─── Lignes ───────────────────────────────────────────────────────────────

export interface LineSnapshot {
  position: number;
  label: string;
  quantity: number;
  unit: string;
  unitPriceHT: number;
  vatRate: number;
  vatCategory: 'E' | 'S';
  vatExemptionReasonCode: string | null;
  vatExemptionReasonText: string | null;
  participantId: string | null;
  totalHT: number;
}

/** UN/ECE rec. 20 — C62 = unité. Cf. convention 1 en tête de fichier. */
const UNITE_FORFAIT = 'C62';

/**
 * EN 16931 : `E` = exonéré, `S` = taux standard. Start Academy est en E sur
 * toute sa production (formation professionnelle continue, art. 261-4-4°a).
 * Le champ existe quand même : le jour où une prestation de conseil non
 * exonérée est facturée, elle doit pouvoir porter S sans migration.
 */
export function vatCategoryFor(vatRate: number): 'E' | 'S' {
  return vatRate === 0 ? 'E' : 'S';
}

function centimes(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `01/06/2026` — parts UTC, pour que le fuseau du serveur ne change pas un libellé figé. */
function jour(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export interface TrainingLineParticipant {
  participantId: string | null;
  personFirstName: string;
  personLastName: string;
  priceHT: number;
}

export interface TrainingLinesInput {
  formationTitre: string;
  sessionCode: string | null;
  startDate: Date | null;
  endDate: Date | null;
  dureeHeures: number | null;
  vatRate: number;
  /** `Tenant.vatExemptionText`, défaut applicatif `MENTION_TVA`. */
  vatExemptionText: string | null;
  participants: TrainingLineParticipant[];
}

/**
 * Une ligne par stagiaire — y compris sur une facture individuelle, qui n'est
 * que le cas N = 1. Le libellé se lit seul : sur une facture groupée, un
 * financeur doit pouvoir rattacher une ligne à une personne sans ouvrir la
 * session dans l'app.
 */
export function buildTrainingLines(input: TrainingLinesInput): LineSnapshot[] {
  const vatCategory = vatCategoryFor(input.vatRate);
  const exoneration = vatCategory === 'E' ? (input.vatExemptionText?.trim() || null) : null;

  const debut = jour(input.startDate);
  const fin = jour(input.endDate);
  const periode = debut && fin ? (debut === fin ? `le ${debut}` : `du ${debut} au ${fin}`) : null;

  return input.participants.map((p, i) => {
    const prix = centimes(p.priceHT);
    const stagiaire = `${p.personFirstName} ${p.personLastName.toUpperCase()}`.trim();
    const morceaux = [
      `Formation « ${input.formationTitre} »`,
      input.sessionCode,
      input.dureeHeures ? `${input.dureeHeures} h` : null,
      periode,
      stagiaire || null,
    ].filter((m): m is string => Boolean(m));

    return {
      position: i + 1,
      label: morceaux.join(' — '),
      quantity: 1,
      unit: UNITE_FORFAIT,
      unitPriceHT: prix,
      vatRate: input.vatRate,
      vatCategory,
      // D-2 non tranchée — cf. convention 3 en tête de fichier.
      vatExemptionReasonCode: null,
      vatExemptionReasonText: exoneration,
      participantId: p.participantId,
      totalHT: prix,
    };
  });
}

export interface CreditNoteLineInput {
  originalNumber: string;
  motif: string;
  /** Montant POSITIF à créditer — la ligne, elle, sortira négative. */
  amountHtToCredit: number;
  vatRate: number;
  vatExemptionText: string | null;
  participantId: string | null;
}

export function buildCreditNoteLine(input: CreditNoteLineInput): LineSnapshot {
  const vatCategory = vatCategoryFor(input.vatRate);
  const montant = -Math.abs(centimes(input.amountHtToCredit));
  return {
    position: 1,
    label: `Avoir sur facture ${input.originalNumber} — ${input.motif}`,
    quantity: 1,
    unit: UNITE_FORFAIT,
    unitPriceHT: montant,
    vatRate: input.vatRate,
    vatCategory,
    vatExemptionReasonCode: null,
    vatExemptionReasonText: vatCategory === 'E' ? (input.vatExemptionText?.trim() || null) : null,
    participantId: input.participantId,
    totalHT: montant,
  };
}

// ─── Contrat de montants ──────────────────────────────────────────────────

/** Somme en `Number` — comparer des `Decimal` rendrait l'égalité toujours fausse. */
export function linesTotalHT(lines: Pick<LineSnapshot, 'totalHT'>[]): number {
  return centimes(lines.reduce((s, l) => s + Number(l.totalHT), 0));
}

/**
 * Le contrat, appliqué AVANT l'écriture et pas seulement en test : une facture
 * dont les lignes ne redonnent pas le total dirait deux choses différentes au
 * client et à l'État. Zéro ligne est un échec, pas un cas neutre — c'est
 * exactement la « facture vide » que le lot interdit.
 */
export function checkLinesMatchTotal(
  amountHT: number,
  lines: Pick<LineSnapshot, 'totalHT'>[],
): { ok: true } | { ok: false; error: string } {
  if (lines.length === 0) {
    return { ok: false, error: 'Facture sans ligne : refus d’émettre une pièce vide.' };
  }
  const total = linesTotalHT(lines);
  if (Math.abs(total - centimes(amountHT)) >= 0.005) {
    return {
      ok: false,
      error: `Incohérence de montants : le total de la facture est ${centimes(amountHT)} € HT mais ses lignes font ${total} €.`,
    };
  }
  return { ok: true };
}

// ─── Empreinte des données rendues ────────────────────────────────────────

export interface FactureSource {
  kind: 'FACTURE';
  seller: PartySnapshot;
  buyer: PartySnapshot;
  delivery: PartySnapshot | null;
  formation: {
    titre: string | null;
    code: string | null;
    debut: Date | null;
    fin: Date | null;
    dureeHeures: number | null;
    lieu: string | null;
    formateur: string | null;
    modalite: string | null;
  };
  stagiaires: string[];
  montants: { amountHT: number; vatRate: number; amountTTC: number };
  notes: string | null;
  reglement: { iban: string | null; bic: string | null };
}

export interface AvoirSource {
  kind: 'AVOIR';
  seller: PartySnapshot;
  buyer: PartySnapshot | null;
  originalNumber: string;
  motif: string;
  montants: { amountHT: number; vatRate: number; amountTTC: number };
}

export type InvoiceSourceInput = FactureSource | AvoirSource;

/**
 * Projection des champs d'ENTRÉE — même discipline que `buildDocumentSource` :
 * un `switch` par nature de pièce, et rien d'autre que ce que la pièce porte.
 *
 * Volontairement ABSENTS, parce que calculés au moment de la génération :
 *  · le NUMÉRO (attribué par la séquence à l'insertion) ;
 *  · la DATE D'ÉMISSION (`resolveInvoiceIssueDate` retombe sur le jour courant
 *    quand la session n'est pas terminée) ;
 *  · l'ÉCHÉANCE (comptée depuis `Date.now()`).
 * Les inclure ferait « périmer » toute facture le lendemain de sa production
 * sans que rien n'ait bougé — règle 2 de `source-fingerprint.ts`.
 *
 * Ce que l'empreinte DÉTECTE, en revanche : un prix, une raison sociale, des
 * dates de session ou un lieu modifiés après l'émission. Sur une facture, ce
 * n'est pas un document à régénérer que ça signale — c'est une écriture qui
 * n'aurait pas dû avoir lieu (`/tarification` : une pièce émise s'annule par
 * avoir, elle ne se réécrit pas).
 */
export function buildInvoiceSource(input: InvoiceSourceInput): Record<string, unknown> {
  if (input.kind === 'AVOIR') {
    return {
      piece: 'AVOIR',
      vendeur: input.seller,
      acheteur: input.buyer,
      avoirSur: input.originalNumber,
      motif: input.motif,
      montants: input.montants,
    };
  }
  return {
    piece: 'FACTURE',
    vendeur: input.seller,
    acheteur: input.buyer,
    livraison: input.delivery,
    formation: input.formation,
    // Un groupe est un ENSEMBLE : l'ordre dans lequel la base rend les
    // inscrits ne doit pas changer l'empreinte (même garantie que
    // `stagiairesTries` dans source-fingerprint.ts).
    stagiaires: [...input.stagiaires].sort((a, b) => a.localeCompare(b, 'fr')),
    montants: input.montants,
    notes: input.notes,
    reglement: input.reglement,
  };
}

/** SHA-256 de la projection. Se compare avec `compareSourceFingerprint`. */
export function fingerprintInvoice(input: InvoiceSourceInput): string {
  return computeFingerprint(buildInvoiceSource(input));
}
