/**
 * Identité de l'organisme de formation (OF) — source unique pour les PDF générés.
 *
 * Toutes les valeurs viennent de l'environnement (`OF_*`) avec des fallbacks
 * cohérents : si `OF_CONTACT_*` est vide, on retombe sur `OF_RESP_*` ; si
 * `OF_RESP_PHONE` est vide, on retombe sur `OF_PHONE`. Centralisé pour éviter
 * que chaque générateur PDF (AGEFICE, programme, attestation, facture) ne
 * réimplémente sa propre lecture des variables d'env.
 */

function envOr(key: string, fallback = ''): string {
  return (process.env[key] ?? '').trim() || fallback;
}

export type OfCivilite = 'MR' | 'MME';

export interface OfPerson {
  civilite: OfCivilite | null;
  nom: string;
  prenom: string;
  titre: string;            // ex: "PDG", "Gérant", "Directeur" — affiché sous la signature
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
  tvaIntra: string;
  iban: string;
  bic: string;
  resp: OfPerson;
  contact: OfPerson;
}

function readCivilite(key: string): OfCivilite | null {
  const v = envOr(key).toUpperCase();
  if (v === 'MR' || v === 'M' || v === 'M.') return 'MR';
  if (v === 'MME' || v === 'MRS' || v === 'MS') return 'MME';
  return null;
}

export function getOfConfig(): OfConfig {
  const phone = envOr('OF_PHONE');
  const email = envOr('OF_EMAIL');
  const resp: OfPerson = {
    civilite: readCivilite('OF_RESP_CIVILITE'),
    nom: envOr('OF_RESP_NOM'),
    prenom: envOr('OF_RESP_PRENOM'),
    titre: envOr('OF_RESP_TITRE'),
    phone: envOr('OF_RESP_PHONE', phone),
    email: envOr('OF_RESP_EMAIL', email),
  };
  // Contact OF par défaut = même personne que le Responsable
  const contact: OfPerson = {
    civilite: readCivilite('OF_CONTACT_CIVILITE') ?? resp.civilite,
    nom: envOr('OF_CONTACT_NOM', resp.nom),
    prenom: envOr('OF_CONTACT_PRENOM', resp.prenom),
    titre: envOr('OF_CONTACT_TITRE', resp.titre),
    phone: envOr('OF_CONTACT_PHONE', resp.phone),
    email: envOr('OF_CONTACT_EMAIL', resp.email),
  };

  const street = envOr('OF_ADDRESS_STREET');
  const cp = envOr('OF_ADDRESS_CP');
  const ville = envOr('OF_ADDRESS_VILLE');
  const addressFull = [street, [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return {
    name: envOr('OF_NAME', 'Start Academy'),
    siret: envOr('OF_SIRET'),
    rnq: envOr('OF_RNQ'),
    addressStreet: street,
    addressCp: cp,
    addressVille: ville,
    addressFull,
    phone,
    email,
    tvaIntra: envOr('OF_TVA_INTRA'),
    iban: envOr('OF_IBAN'),
    bic: envOr('OF_BIC'),
    resp,
    contact,
  };
}
