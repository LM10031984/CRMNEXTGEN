/**
 * Lot 0 · 0.2 — empreinte des DONNÉES D'ENTRÉE d'un document.
 * Écart E-1 de l'audit produit du 28/08/2026.
 *
 * `Document.hashSha256` est l'empreinte du PDF *produit*. Elle prouve que le
 * fichier n'a pas été altéré ; elle ne dit rien de « ce fichier raconte-t-il
 * encore la vérité ». Quand le prix, les dates, le lieu ou le programme bougent
 * après la génération, le PDF reste identique à lui-même — et devient faux en
 * silence. C'est le mode de défaillance qui ne se voit qu'en audit ou au refus
 * du financeur.
 *
 * `Document.sourceFingerprint` = SHA-256 du JSON des champs d'entrée
 * EFFECTIVEMENT rendus, posé à la génération. Recalculé plus tard sur la donnée
 * courante, il rend un verdict binaire là où la comparaison `createdAt` vs
 * `updatedAt` ne donnait qu'un soupçon (et un faux positif à chaque écriture
 * sur un champ que le document ne porte pas).
 *
 * ── Trois règles qui font tenir le dispositif ──────────────────────────────
 *
 * 1. UNE SEULE fonction de calcul, appelée à l'écriture ET à la lecture. Deux
 *    chemins distincts dériveraient au premier refactor et toute la détection
 *    deviendrait du bruit.
 *
 * 2. AUCUNE valeur calculée au moment de la génération dans l'empreinte —
 *    ni `new Date()`, ni date de signature dérivée du jour courant. Sinon le
 *    document devient « périmé » le lendemain de sa production, sans que rien
 *    n'ait bougé.
 *
 * 3. Chaque projection ne couvre QUE les champs que le document porte
 *    réellement. Ajouter `internalNotes` à une projection, c'est fabriquer le
 *    faux positif que `/coherence-docs` classe en catégorie 4.
 *
 * Ce module est PUR (zéro import Prisma) — même contrainte d'architecture que
 * `resolve-docs.ts`, pour rester testable sans base. Le chargement de la donnée
 * vit dans `document-source.ts`.
 */

import { createHash } from 'node:crypto';

// ─── Contexte source (formes minces, découplées de Prisma) ────────────────

export interface SourceTenant {
  legalName: string | null;
  siret: string | null;
  address: string | null;
}

export interface SourceOrganization {
  legalName: string | null;
  siret: string | null;
  siren: string | null;
  representative: string | null;
  city: string | null;
}

export interface SourcePerson {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface SourceParticipant {
  priceHT: unknown;
  financingMode: string | null;
  financingRequestDate: unknown;
}

export interface SourceSession {
  code: string | null;
  name: string | null;
  startDate: unknown;
  endDate: unknown;
  modality: string | null;
  pricePerLearner: unknown;
}

export interface SourceSlot {
  date: unknown;
  startTime: string | null;
  endTime: string | null;
  halfDay: string | null;
}

export interface SourceLocation {
  legalName: string | null;
  name: string | null;
  address: unknown;
}

export interface SourceProduct {
  code: string | null;
  title: string | null;
  durationHours: number | null;
  priceHT: unknown;
  programMd: string | null;
  objectives: unknown;
  pedagogicalMethods: string | null;
  evaluationMethods: string | null;
  accessibility: string | null;
  accessConditions: string | null;
  trainerProfile: string | null;
  ageficeFormationType: string | null;
  ageficeNiveau: string | null;
  ageficeCertif: string | null;
  ageficeAttestation: string | null;
}

export interface DocumentSourceContext {
  tenant: SourceTenant | null;
  session: SourceSession | null;
  slots: SourceSlot[];
  location: SourceLocation | null;
  product: SourceProduct | null;
  /** Formateur principal (celui qui signe) — nom complet, pas l'id. */
  primaryTrainer: string | null;
  participant: SourceParticipant | null;
  person: SourcePerson | null;
  sponsorOrg: SourceOrganization | null;
  /**
   * Convention ENTREPRISE (groupe) : la liste des stagiaires couverts fait
   * partie de ce que le PDF affiche. Un salarié inscrit après coup rend la
   * convention groupe incomplète — c'est exactement ce qu'on veut détecter.
   */
  groupStagiaires: SourcePerson[] | null;
}

// ─── Normalisation + sérialisation stable ─────────────────────────────────

/**
 * Normalise une valeur pour la rendre comparable d'une génération à l'autre :
 *  - `Date` → ISO 8601 (le fuseau du serveur ne doit pas changer l'empreinte)
 *  - `Decimal` Prisma (tout objet exposant `toNumber`) → number
 *    (3024 et Decimal("3024.00") DOIVENT donner la même empreinte)
 *  - `undefined` → `null` (un champ absent et un champ nul valent pareil ici)
 *  - objets → clés triées, récursivement (l'ordre d'écriture ne compte pas)
 */
export function normalizeForFingerprint(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForFingerprint);
  if (typeof value === 'object') {
    const asDecimal = value as { toNumber?: unknown };
    if (typeof asDecimal.toNumber === 'function') {
      const n = (asDecimal.toNumber as () => number)();
      return Number.isFinite(n) ? n : null;
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalizeForFingerprint((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

/** JSON déterministe : deux objets sémantiquement égaux donnent la même chaîne. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForFingerprint(value));
}

/** SHA-256 hexadécimal du JSON stable. */
export function computeFingerprint(source: unknown): string {
  return createHash('sha256').update(stableStringify(source)).digest('hex');
}

// ─── Projections par type de document ─────────────────────────────────────

/**
 * Types couverts par l'empreinte.
 *
 * Hors périmètre volontairement :
 *  - `EMARGEMENT` : porté par `PedagogicalAsset`, qui n'a pas la colonne.
 *  - `FACTURE`    : l'empreinte d'une facture vit sur `Invoice.sourceFingerprint`
 *    et se calcule dans `lib/einvoice/invoice-snapshot.ts` (livré au lot 1 de
 *    la spec facturation électronique du 02/09) — mêmes primitives, projection
 *    propre à la pièce comptable. NE PAS ajouter `FACTURE` ici : deux
 *    définitions rivales de la même empreinte seraient pires que pas
 *    d'empreinte du tout.
 */
export const FINGERPRINTED_DOC_TYPES = [
  'CONVENTION',
  'CONVOCATION',
  'PROGRAMME',
  'AGEFICE',
  'ASSIDUITE',
  'ATTESTATION_FIN',
  'CERTIFICAT_REALISATION',
] as const;

export type FingerprintedDocType = (typeof FINGERPRINTED_DOC_TYPES)[number];

export function isFingerprintable(docType: string): docType is FingerprintedDocType {
  return (FINGERPRINTED_DOC_TYPES as readonly string[]).includes(docType);
}

function lieuSource(ctx: DocumentSourceContext) {
  if (!ctx.location) return null;
  return {
    legalName: ctx.location.legalName,
    name: ctx.location.name,
    address: ctx.location.address,
  };
}

/**
 * La composition d'un groupe est un ENSEMBLE, pas une liste : l'ordre dans
 * lequel la base rend les inscrits ne doit pas changer l'empreinte. La garantie
 * vit ici, dans la définition de la source, et pas dans le chargeur — sinon un
 * second appelant la perdrait sans que rien ne le signale.
 */
function stagiairesTries(stagiaires: SourcePerson[] | null): SourcePerson[] | null {
  if (!stagiaires) return null;
  return [...stagiaires].sort((a, b) =>
    `${a.lastName ?? ''}|${a.firstName ?? ''}|${a.email ?? ''}`.localeCompare(
      `${b.lastName ?? ''}|${b.firstName ?? ''}|${b.email ?? ''}`,
      'fr',
    ),
  );
}

function produitPedagogique(ctx: DocumentSourceContext) {
  if (!ctx.product) return null;
  return {
    title: ctx.product.title,
    durationHours: ctx.product.durationHours,
    objectives: ctx.product.objectives,
    programMd: ctx.product.programMd,
  };
}

/**
 * Projection des champs d'entrée d'un document.
 *
 * `null` = type non couvert → l'empreinte n'est pas posée et le verdict de
 * péremption restera « inconnu ». On préfère l'aveu à la fausse assurance.
 */
export function buildDocumentSource(
  docType: string,
  ctx: DocumentSourceContext,
): Record<string, unknown> | null {
  switch (docType) {
    // Prix, dates, lieu, raison sociale du bénéficiaire, programme, durée :
    // tout ce qui engage juridiquement les deux parties.
    case 'CONVENTION':
      return {
        beneficiaire: ctx.sponsorOrg,
        stagiaire: ctx.person,
        // Convention groupe : la composition du groupe fait partie du contrat.
        groupStagiaires: stagiairesTries(ctx.groupStagiaires),
        prixHT: ctx.participant?.priceHT ?? ctx.session?.pricePerLearner ?? ctx.product?.priceHT ?? null,
        sessionDates: { debut: ctx.session?.startDate, fin: ctx.session?.endDate },
        sessionTitre: ctx.session?.name ?? ctx.product?.title ?? null,
        modalite: ctx.session?.modality ?? null,
        lieu: lieuSource(ctx),
        produit: produitPedagogique(ctx),
        profilFormateur: ctx.product?.trainerProfile ?? null,
        of: ctx.tenant,
      };

    // La convocation annonce des HORAIRES : les créneaux réels en font partie
    // (défaut connu E-8 : convocation 9h-17h vs créneaux 9h-13h / 14h-18h).
    case 'CONVOCATION':
      return {
        stagiaire: ctx.person,
        sessionDates: { debut: ctx.session?.startDate, fin: ctx.session?.endDate },
        sessionTitre: ctx.session?.name ?? ctx.product?.title ?? null,
        creneaux: ctx.slots,
        lieu: lieuSource(ctx),
        formateur: ctx.primaryTrainer,
        of: ctx.tenant,
      };

    // Programme produit (catalogue) ou programme de session (même contenu,
    // tarif de la session). Le tarif est inclus : c'est ce qui distingue les
    // deux documents.
    case 'PROGRAMME':
      return {
        produit: produitPedagogique(ctx),
        pedagogicalMethods: ctx.product?.pedagogicalMethods ?? null,
        evaluationMethods: ctx.product?.evaluationMethods ?? null,
        accessibility: ctx.product?.accessibility ?? null,
        accessConditions: ctx.product?.accessConditions ?? null,
        trainerProfile: ctx.product?.trainerProfile ?? null,
        prixHT: ctx.session ? (ctx.session.pricePerLearner ?? ctx.product?.priceHT ?? null) : (ctx.product?.priceHT ?? null),
        of: ctx.tenant,
      };

    // Fiche AGEFICE : identité, structure, lieu, dates, montant, champs Cerfa.
    case 'AGEFICE':
      return {
        stagiaire: ctx.person,
        structure: ctx.sponsorOrg,
        prixHT: ctx.participant?.priceHT ?? null,
        financement: {
          mode: ctx.participant?.financingMode ?? null,
          dateDemande: ctx.participant?.financingRequestDate ?? null,
        },
        sessionDates: { debut: ctx.session?.startDate, fin: ctx.session?.endDate },
        lieu: lieuSource(ctx),
        produit: {
          title: ctx.product?.title ?? null,
          durationHours: ctx.product?.durationHours ?? null,
          formationType: ctx.product?.ageficeFormationType ?? null,
          niveau: ctx.product?.ageficeNiveau ?? null,
          certif: ctx.product?.ageficeCertif ?? null,
          attestation: ctx.product?.ageficeAttestation ?? null,
        },
        of: ctx.tenant,
      };

    // Attestation d'assiduité AGEFICE : créneaux + identité + durée.
    case 'ASSIDUITE':
      return {
        stagiaire: ctx.person,
        structure: ctx.sponsorOrg,
        sessionDates: { debut: ctx.session?.startDate, fin: ctx.session?.endDate },
        creneaux: ctx.slots,
        dureeHeures: ctx.product?.durationHours ?? null,
        formateur: ctx.primaryTrainer,
        of: ctx.tenant,
      };

    // Attestation de fin / certificat de réalisation : identité, dates, durée,
    // intitulé, formateur signataire, lieu. Pas de prix (ils n'en portent pas).
    case 'ATTESTATION_FIN':
    case 'CERTIFICAT_REALISATION':
      return {
        stagiaire: ctx.person,
        sessionCode: ctx.session?.code ?? null,
        sessionDates: { debut: ctx.session?.startDate, fin: ctx.session?.endDate },
        intitule: ctx.session?.name ?? ctx.product?.title ?? null,
        dureeHeures: ctx.product?.durationHours ?? null,
        objectifs: ctx.product?.objectives ?? null,
        lieu: lieuSource(ctx),
        formateur: ctx.primaryTrainer,
        of: ctx.tenant,
      };

    default:
      return null;
  }
}

/** Empreinte d'un document à partir d'un contexte déjà chargé. */
export function fingerprintDocumentSource(
  docType: string,
  ctx: DocumentSourceContext,
): string | null {
  const source = buildDocumentSource(docType, ctx);
  return source === null ? null : computeFingerprint(source);
}

// ─── Verdict ──────────────────────────────────────────────────────────────

/**
 * `unknown` — document produit avant la colonne, ou type non couvert. On ne
 *   sait pas, et on le dit : c'est `/coherence-docs` qui couvre le parc ancien
 *   par l'heuristique des dates.
 * `fresh`   — la donnée courante redonne la même empreinte.
 * `stale`   — au moins un champ RENDU a changé depuis la génération.
 */
export type StalenessVerdict = 'unknown' | 'fresh' | 'stale';

export function compareSourceFingerprint(
  stored: string | null | undefined,
  current: string | null | undefined,
): StalenessVerdict {
  if (!stored || !current) return 'unknown';
  return stored === current ? 'fresh' : 'stale';
}
