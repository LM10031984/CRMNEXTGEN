/**
 * Identité de l'organisme de formation (OF) — source unique pour les PDF générés.
 *
 * **Phase 7 (D-01 hybrid BDD/ENV)** :
 * - `loadOfConfig(tenantId)` : lit `Tenant` en BDD, fallback `process.env.OF_*`
 *   field-by-field. Première sauvegarde via Paramètres → bascule en BDD.
 * - `getOfConfig()` : legacy sync, ENV-only (utilisé par les footers PDF
 *   sans contexte tenantId : `of-paged-footer.ts`, `of-pdf-footer.ts`).
 * - `resolveOfConfig(tenant)` : helper pur (testable) qui applique la stratégie
 *   pick-BDD-or-ENV champ par champ.
 *
 * Centralisé pour éviter que chaque générateur PDF (AGEFICE, programme,
 * attestation, facture, convention) ne réimplémente sa propre lecture
 * (cf. drift `invoices.ts` corrigé Plan 07-01).
 */

import { prisma } from '@qualiof/db';
import type { Tenant } from '@qualiof/db';

export type OfCivilite = 'MR' | 'MME';

export interface OfPerson {
  civilite: OfCivilite | null;
  nom: string;
  prenom: string;
  titre: string; // ex: "PDG", "Gérant", "Directeur" — affiché sous la signature
  phone: string;
  email: string;
}

export interface OfConfig {
  name: string;
  siret: string;
  rnq: string;
  addressStreet: string;
  addressCp: string;
  addressVille: string;
  addressFull: string;
  phone: string;
  email: string;
  emailFrom: string; // Phase 7 : expéditeur SMTP (D-08), fallback `email`
  tvaIntra: string;
  iban: string;
  bic: string;
  // Phase 7 — identité juridique étendue (SET-01/02)
  legalForm: string;
  legalMentions: string;
  rcs: string;
  // Phase 7 — Préférences SET-03
  invoicePrefix: string;
  // Phase 7 — paths assets uploadés (relatifs à `apps/web/public`)
  logoPath: string;
  signaturePedagoPath: string;
  signatureDirigeantPath: string;
  // Référent handicap (Qualiopi indicateur 26) — défaut Start Academy "Laurent MARX"
  handicapReferent: string;
  resp: OfPerson;
  contact: OfPerson;
}

/**
 * Picks BDD value first (trimmed), fallback ENV var (trimmed), fallback default.
 * Treats empty strings as null (whitespace = "not set").
 */
function pick(bdd: string | null | undefined, envKey: string, fallback = ''): string {
  const bddVal = (bdd ?? '').trim();
  if (bddVal) return bddVal;
  const envVal = (process.env[envKey] ?? '').trim();
  return envVal || fallback;
}

function readCivilite(key: string): OfCivilite | null {
  const v = (process.env[key] ?? '').trim().toUpperCase();
  if (v === 'MR' || v === 'M' || v === 'M.') return 'MR';
  if (v === 'MME' || v === 'MRS' || v === 'MS') return 'MME';
  return null;
}

/**
 * Type bridge : on n'importe que les champs utilisés (et le shape Json
 * pour `address`) — évite de coupler aux internals Prisma.
 */
type TenantInput = Pick<
  Tenant,
  | 'name'
  | 'siret'
  | 'numDA'
  | 'rcs'
  | 'legalForm'
  | 'legalMentions'
  | 'iban'
  | 'bic'
  | 'emailFrom'
  | 'invoicePrefix'
  | 'logoPath'
  | 'signaturePedagoPath'
  | 'signatureDirigeantPath'
  | 'address'
>;

/**
 * Helper pur — applique la stratégie BDD-then-ENV champ par champ.
 * Exporté pour testabilité (cf. of-config.test.ts).
 *
 * @param t Tenant row depuis Prisma OU `null` → tout en fallback ENV.
 */
export function resolveOfConfig(t: TenantInput | null): OfConfig {
  // Address Json — shape attendu : { street, postalCode|cp, city|ville }
  const address = (t?.address ?? null) as Record<string, unknown> | null;
  const addrStreet = pick(
    typeof address?.street === 'string' ? (address.street as string) : null,
    'OF_ADDRESS_STREET',
  );
  const addrCp = pick(
    typeof address?.postalCode === 'string'
      ? (address.postalCode as string)
      : typeof address?.cp === 'string'
        ? (address.cp as string)
        : null,
    'OF_ADDRESS_CP',
  );
  const addrVille = pick(
    typeof address?.city === 'string'
      ? (address.city as string)
      : typeof address?.ville === 'string'
        ? (address.ville as string)
        : null,
    'OF_ADDRESS_VILLE',
  );
  const addressFull = [addrStreet, [addrCp, addrVille].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  const phone = pick(null, 'OF_PHONE'); // pas encore en BDD — Phase 7 garde ENV
  const email = pick(null, 'OF_EMAIL'); // pas encore en BDD

  const resp: OfPerson = {
    civilite: readCivilite('OF_RESP_CIVILITE'),
    nom: pick(null, 'OF_RESP_NOM'),
    prenom: pick(null, 'OF_RESP_PRENOM'),
    titre: pick(null, 'OF_RESP_TITRE'),
    phone: pick(null, 'OF_RESP_PHONE', phone),
    email: pick(null, 'OF_RESP_EMAIL', email),
  };

  // Contact OF par défaut = même personne que le Responsable
  const contactCiviliteRaw = readCivilite('OF_CONTACT_CIVILITE');
  const contact: OfPerson = {
    civilite: contactCiviliteRaw ?? resp.civilite,
    nom: pick(null, 'OF_CONTACT_NOM', resp.nom),
    prenom: pick(null, 'OF_CONTACT_PRENOM', resp.prenom),
    titre: pick(null, 'OF_CONTACT_TITRE', resp.titre),
    phone: pick(null, 'OF_CONTACT_PHONE', resp.phone),
    email: pick(null, 'OF_CONTACT_EMAIL', resp.email),
  };

  return {
    name: pick(t?.name, 'OF_NAME', 'Start Academy'),
    siret: pick(t?.siret, 'OF_SIRET'),
    rnq: pick(t?.numDA, 'OF_RNQ'),
    addressStreet: addrStreet,
    addressCp: addrCp,
    addressVille: addrVille,
    addressFull,
    phone,
    email,
    emailFrom: pick(t?.emailFrom, 'OF_EMAIL', email),
    tvaIntra: pick(null, 'OF_TVA_INTRA'),
    iban: pick(t?.iban, 'OF_IBAN'),
    bic: pick(t?.bic, 'OF_BIC'),
    legalForm: pick(t?.legalForm, 'OF_LEGAL_FORM'),
    legalMentions: pick(t?.legalMentions, 'OF_LEGAL_MENTIONS'),
    rcs: pick(t?.rcs, 'OF_RCS'),
    invoicePrefix: pick(t?.invoicePrefix, 'OF_INVOICE_PREFIX', 'FAC'),
    logoPath: pick(t?.logoPath, 'OF_LOGO_PATH'),
    signaturePedagoPath: pick(t?.signaturePedagoPath, 'OF_SIGNATURE_PEDAGO_PATH'),
    signatureDirigeantPath: pick(t?.signatureDirigeantPath, 'OF_SIGNATURE_DIRIGEANT_PATH'),
    handicapReferent: pick(null, 'OF_HANDICAP_REFERENT', 'Laurent MARX'),
    resp,
    contact,
  };
}

/**
 * **Phase 7 entrypoint** — async, lit le Tenant en BDD puis applique le fallback ENV.
 *
 * Appelé depuis les Server Actions ayant accès à `user.tenantId` via
 * `validateRequest()`. Le résultat doit être passé en paramètre `data` aux
 * templates de rendu (pattern pre-resolve, cf. RESEARCH.md Finding 2).
 */
export async function loadOfConfig(tenantId: string): Promise<OfConfig> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return resolveOfConfig(tenant);
}

/**
 * Legacy sync — utilisé uniquement par les footers PDF qui n'ont pas de
 * contexte `tenantId` au call site (`of-paged-footer.ts`, `of-pdf-footer.ts`).
 * Retourne tous les champs en fallback ENV (équivalent à `resolveOfConfig(null)`).
 */
export function getOfConfig(): OfConfig {
  return resolveOfConfig(null);
}
