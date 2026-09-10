/**
 * Cascade UNIQUE du représentant d'une organisation — nom, puis email.
 * Lot C.2a, tâche 1 (spec signature 2026-09-04 §5 lot C).
 *
 * POURQUOI CE MODULE EXISTE. La convention imprime « Représentée par X ».
 * Jusqu'ici, la cascade qui décide de ce X vivait à DEUX endroits de
 * `convention-core.ts` : le chemin individuel et le chemin groupe. Laisser le
 * moteur d'envoi en écrire une TROISIÈME, c'était accepter qu'un jour on envoie
 * signer à Y une pièce qui nomme X. Une convention signée par quelqu'un d'autre
 * que le représentant qu'elle désigne est contestable devant un financeur, et
 * la divergence resterait invisible tant que chaque cascade est testée chez
 * elle. Il n'en existe donc plus qu'une, ici, et les trois appelants l'appellent.
 *
 * DEUX FONCTIONS, PAS UNE. Le nom et l'email se résolvent séparément parce que
 * la génération de convention n'a besoin QUE du nom : sa requête Prisma ne
 * charge que le contact principal (`where: { isPrimary: true }, take: 1`), et
 * cette forme est verrouillée par un test. Un appel unique qui rendrait
 * `{ nom, email }` forcerait à élargir cette requête pour un besoin qui n'est
 * pas le sien.
 *
 * L'INVARIANT QUI COMPTE. Le NOM ne se résout QUE sur les contacts `isPrimary`.
 * Le moteur d'envoi, lui, charge TOUS les contacts pour trouver une adresse :
 * sans cet invariant, il finirait par désigner comme signataire un contact
 * secondaire que la convention n'imprime pas. Seul l'EMAIL peut venir d'ailleurs,
 * et sa provenance est alors NOMMÉE (`CONTACT_AUTRE`) pour être montrée à
 * l'admin plutôt que masquée.
 *
 * Module PUR : ni base, ni réseau, ni horloge. C'est ce qui rend les cas tordus
 * testables en une ligne.
 */

import { normalizeForMatch } from '@/lib/signed-scan-match';

/** D'où vient le NOM du représentant. Se lit dans le récapitulatif d'envoi (C.2b). */
export type SourceRepresentant =
  | 'ORG_REPRESENTATIVE'
  | 'CONTACT_PRINCIPAL'
  | 'APPRENANT_EI_SELF'
  | 'APPRENANT_REPLI';

/** D'où vient l'EMAIL. `CONTACT_AUTRE` = un contact qui n'est pas le représentant nommé. */
export type SourceEmailRepresentant = 'PERSON' | 'CONTACT_NOMME' | 'CONTACT_AUTRE';

export interface ContactCandidat {
  firstName: string;
  lastName: string;
  email?: string | null;
  isPrimary: boolean;
}

export interface OrganisationRepresentee {
  id: string;
  legalName: string;
  representative: string | null;
  /** Contacts DÉJÀ ordonnés par l'appelant : `isPrimary` d'abord, puis `createdAt asc`. */
  contacts: ContactCandidat[];
}

export interface Apprenant {
  firstName: string;
  lastName: string;
  email?: string | null;
}

export type ResolutionRepresentant =
  | { ok: true; nom: string; source: SourceRepresentant }
  | { ok: false; error: string };

export type ResolutionEmailRepresentant =
  | { ok: true; email: string; source: SourceEmailRepresentant }
  | { ok: false; error: string };

/** « Prénom NOM » — la forme que le PDF imprime déjà. */
export function nomAffiche(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName.toUpperCase()}`.trim();
}

/** Une chaîne utile, ou `null`. Un champ rempli d'espaces est un champ vide. */
function texteNonVide(valeur: string | null | undefined): string | null {
  const nettoye = (valeur ?? '').trim();
  return nettoye.length > 0 ? nettoye : null;
}

/**
 * Clé de comparaison d'un nom : sans accents, sans casse, ordre indifférent.
 * « BLANCHON Gilles » et « Gilles Blanchon » désignent la même personne — un
 * annuaire de contacts saisi à la main mélange les deux ordres.
 */
function clefDeNom(nom: string): string {
  return normalizeForMatch(nom).split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Refus du NOM — repris MOT POUR MOT du refus posé le 21/08 sur la convention
 * EXPERTA (« Représentée par , » partie au portail OPCO EP). Il nomme
 * l'entreprise, donne le lien de sa fiche, et dit pourquoi on ne produit rien.
 */
function refusRepresentant(org: OrganisationRepresentee): string {
  return (
    `Représentant légal inconnu pour « ${org.legalName} » : renseignez le représentant ` +
    `sur la fiche entreprise (/app/organisations/${org.id}) ou désignez un contact ` +
    `principal. Une convention sans signataire n'est pas opposable.`
  );
}

/** Refus de l'EMAIL — même forme nominative : sans adresse, rien ne peut partir. */
function refusEmail(org: OrganisationRepresentee): string {
  return (
    `Aucun email de signataire pour « ${org.legalName} » : renseignez l'email du ` +
    `représentant ou d'un contact sur la fiche entreprise ` +
    `(/app/organisations/${org.id}). Sans adresse, la demande de signature ne peut partir.`
  );
}

/**
 * Le représentant d'une organisation qui commande pour ses salariés
 * (convention de groupe). Extraction stricte de `generateConventionEntrepriseCore`.
 *
 * Cascade : champ explicite de la fiche entreprise, puis PREMIER CONTACT
 * PRINCIPAL, sinon refus. Les contacts non principaux ne sont jamais candidats :
 * c'est l'invariant qui empêche le moteur d'envoi de nommer un signataire que le
 * PDF n'imprimerait pas.
 */
export function resoudreRepresentantEntreprise(
  org: OrganisationRepresentee,
): ResolutionRepresentant {
  const representative = texteNonVide(org.representative);
  if (representative !== null) {
    return { ok: true, nom: representative, source: 'ORG_REPRESENTATIVE' };
  }

  const principal = org.contacts.find((contact) => contact.isPrimary === true);
  if (principal !== undefined) {
    return { ok: true, nom: nomAffiche(principal), source: 'CONTACT_PRINCIPAL' };
  }

  return { ok: false, error: refusRepresentant(org) };
}

/**
 * Le représentant sur le chemin individuel. Extraction stricte de
 * `generateConventionCore`.
 *
 * Ce chemin NE REFUSE JAMAIS : l'apprenant sert de repli, exactement comme
 * aujourd'hui. Le durcir ici casserait la génération de convention en même temps
 * qu'il « améliorerait » l'envoi — un refactor à comportement constant ne fait
 * pas ça.
 */
export function resoudreRepresentantIndividuel(a: {
  org: OrganisationRepresentee;
  apprenant: Apprenant;
  estEiSelf: boolean;
}): ResolutionRepresentant {
  if (a.estEiSelf) {
    return { ok: true, nom: nomAffiche(a.apprenant), source: 'APPRENANT_EI_SELF' };
  }

  const representative = texteNonVide(a.org.representative);
  if (representative !== null) {
    return { ok: true, nom: representative, source: 'ORG_REPRESENTATIVE' };
  }

  return { ok: true, nom: nomAffiche(a.apprenant), source: 'APPRENANT_REPLI' };
}

/** Les sources où le signataire EST l'apprenant : son email est celui de sa fiche. */
const SOURCES_APPRENANT: ReadonlySet<SourceRepresentant> = new Set<SourceRepresentant>([
  'APPRENANT_EI_SELF',
  'APPRENANT_REPLI',
]);

/**
 * L'adresse à laquelle envoyer la demande de signature, dans le MÊME ordre de
 * priorité que le nom.
 *
 * Appelée par le seul moteur d'envoi : la génération de convention n'en a pas
 * besoin et ne charge donc pas les emails.
 *
 * Aucune adresse résoluble ⇒ refus nominatif. Une demande de signature envoyée
 * « vers nulle part » ne produit pas d'erreur chez le prestataire : elle produit
 * un dossier qui n'avance jamais, et personne ne sait pourquoi.
 */
export function resoudreEmailRepresentant(a: {
  nom: string;
  source: SourceRepresentant;
  org: OrganisationRepresentee;
  apprenant?: Apprenant | null;
}): ResolutionEmailRepresentant {
  if (SOURCES_APPRENANT.has(a.source)) {
    const email = texteNonVide(a.apprenant?.email);
    if (email !== null) return { ok: true, email, source: 'PERSON' };
    return { ok: false, error: refusEmail(a.org) };
  }

  // 1) Le contact qui PORTE le nom du représentant résolu, où qu'il soit dans la
  //    liste : c'est lui qui signe, son adresse prime sur toutes les autres.
  const clefRepresentant = clefDeNom(a.nom);
  if (clefRepresentant.length > 0) {
    for (const contact of a.org.contacts) {
      const email = texteNonVide(contact.email);
      if (email === null) continue;
      if (clefDeNom(`${contact.firstName} ${contact.lastName}`) === clefRepresentant) {
        return { ok: true, email, source: 'CONTACT_NOMME' };
      }
    }
  }

  // 2) À défaut, le premier contact joignable — dans l'ordre donné par
  //    l'appelant (`isPrimary` d'abord). La provenance est NOMMÉE : l'admin doit
  //    pouvoir voir que l'adresse n'est pas celle du représentant.
  for (const contact of a.org.contacts) {
    const email = texteNonVide(contact.email);
    if (email !== null) return { ok: true, email, source: 'CONTACT_AUTRE' };
  }

  return { ok: false, error: refusEmail(a.org) };
}
