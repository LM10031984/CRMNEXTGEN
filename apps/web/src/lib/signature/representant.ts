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
 * LA CASCADE RÉELLE, celle du code, est courte : `Organization.representative`
 * s'il est renseigné, sinon le PREMIER CONTACT PRINCIPAL (`isPrimary`, le plus
 * ancien). `Contact.function` — l'intitulé de poste — n'y joue AUCUN rôle : il
 * est saisi librement et ne prouve rien.
 *
 * L'INVARIANT QUI COMPTE. Le NOM ne se résout QUE sur les contacts `isPrimary`.
 * Le moteur d'envoi, lui, charge TOUS les contacts : sans cet invariant, il
 * finirait par désigner comme signataire un contact secondaire que la convention
 * n'imprime pas.
 *
 * AUCUN REPLI SUR UN AUTRE CONTACT (décision Laurent, 10/09/2026). L'email du
 * signataire est celui du représentant résolu, ou rien. Envoyer le lien dans la
 * boîte de B pour une pièce qui nomme A ferait enregistrer l'email et l'adresse
 * IP de B dans le certificat de signature : la preuve serait inexploitable
 * devant un financeur. La SEULE dérogation est une adresse saisie explicitement
 * par l'admin au moment de l'envoi — décision humaine, jamais implicite, et
 * journalisée par la server action.
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
  | 'APPRENANT_REPLI'
  /**
   * Le RÉGIME désigne le stagiaire lui-même (dossier de financement,
   * attestation d'assiduité). Distinct d'`APPRENANT_REPLI`, qui dit « faute de
   * mieux » : ici, l'apprenant n'est pas un repli, c'est le signataire prévu.
   * La distinction se lit dans l'AuditLog de l'envoi.
   */
  | 'APPRENANT_STAGIAIRE';

/**
 * D'où vient l'EMAIL retenu.
 * - `PERSON` : la fiche de l'apprenant, quand c'est lui qui signe.
 * - `CONTACT_NOMME` : le contact qui PORTE le nom du représentant résolu.
 * - `SAISI_PAR_ADMIN` : une adresse saisie à la main devant le récapitulatif
 *   d'envoi. C'est la seule dérogation, et elle se journalise.
 */
export type SourceEmailRepresentant = 'PERSON' | 'CONTACT_NOMME' | 'SAISI_PAR_ADMIN';

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
  /** `nom` est rendu avec l'email pour que l'appelant journalise le COUPLE retenu. */
  | { ok: true; nom: string; email: string; source: SourceEmailRepresentant }
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

/**
 * Refus de l'EMAIL côté entreprise — même forme nominative que le refus du nom.
 * Il nomme la PERSONNE, pas seulement l'organisation, et dit pourquoi on ne se
 * rabat pas sur un autre contact : c'est la question que l'admin va se poser.
 */
function refusEmailRepresentant(nom: string, org: OrganisationRepresentee): string {
  return (
    `Aucun email pour « ${nom} », représentant de « ${org.legalName} » : renseignez son ` +
    `adresse sur la fiche entreprise (/app/organisations/${org.id}), ou saisissez ` +
    `l'adresse à utiliser au moment de l'envoi. Le lien n'est jamais envoyé à un autre ` +
    `contact : son email et son adresse IP figureraient dans le certificat de signature, ` +
    `qui ne prouverait plus rien.`
  );
}

/** Refus de l'EMAIL quand c'est l'apprenant qui signe : sa fiche, pas l'entreprise. */
function refusEmailApprenant(nom: string): string {
  return (
    `Aucun email pour « ${nom} » : renseignez son adresse sur sa fiche apprenant, ou ` +
    `saisissez l'adresse à utiliser au moment de l'envoi. Sans adresse, la demande de ` +
    `signature ne peut pas partir.`
  );
}

/** Refus d'une saisie qui n'est pas une adresse — elle partirait vers nulle part. */
function refusSaisie(nom: string, saisie: string): string {
  return (
    `« ${saisie} » n'est pas une adresse email valide (signataire « ${nom} ») : ` +
    `corrigez-la avant l'envoi.`
  );
}

/**
 * Contrôle MINIMAL de forme. Le module ne prétend pas valider une adresse — il
 * empêche seulement qu'un nom tapé dans le champ email parte chez le
 * prestataire, où le dossier n'avancerait jamais sans que personne sache
 * pourquoi. La validation de saisie complète appartient au schéma Zod de C.2b.
 */
function estUneAdresseEmail(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur);
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

/**
 * Le stagiaire signe pour lui-même — dossier de financement, attestation
 * d'assiduité (lot C.2a-2).
 *
 * Ne refuse jamais : le régime a déjà tranché que c'est lui qui signe, il n'y a
 * pas de cascade à parcourir. La fonction existe malgré tout ici, et pas au fil
 * de l'appelant, pour que TOUS les noms de signataires sortent du même module —
 * c'est ce qui empêche qu'un jour l'un d'eux s'écrive « NOM Prénom ».
 */
export function resoudreStagiaire(apprenant: Apprenant): ResolutionRepresentant {
  return { ok: true, nom: nomAffiche(apprenant), source: 'APPRENANT_STAGIAIRE' };
}

/** Les sources où le signataire EST l'apprenant : son email est celui de sa fiche. */
const SOURCES_APPRENANT: ReadonlySet<SourceRepresentant> = new Set<SourceRepresentant>([
  'APPRENANT_EI_SELF',
  'APPRENANT_REPLI',
  'APPRENANT_STAGIAIRE',
]);

/**
 * L'adresse à laquelle envoyer la demande de signature : celle du REPRÉSENTANT
 * résolu, ou rien.
 *
 * Appelée par le seul moteur d'envoi : la génération de convention n'en a pas
 * besoin et ne charge donc pas les emails.
 *
 * Aucune adresse résoluble ⇒ refus nominatif. Une demande envoyée « vers nulle
 * part » ne produit pas d'erreur chez le prestataire : elle produit un dossier
 * qui n'avance jamais, et personne ne sait pourquoi.
 */
export function resoudreEmailRepresentant(a: {
  nom: string;
  source: SourceRepresentant;
  org: OrganisationRepresentee;
  apprenant?: Apprenant | null;
  /**
   * Adresse saisie par l'admin devant le récapitulatif d'envoi (C.2b). SEULE
   * dérogation au « pas de repli » : une décision humaine, assumée, et que la
   * server action journalise avec le nom retenu.
   */
  emailSaisi?: string | null;
}): ResolutionEmailRepresentant {
  // 0) La saisie de l'admin l'emporte sur tout : elle a été faite en connaissance
  //    de cause, devant le nom du signataire.
  const saisi = texteNonVide(a.emailSaisi);
  if (saisi !== null) {
    if (!estUneAdresseEmail(saisi)) return { ok: false, error: refusSaisie(a.nom, saisi) };
    return { ok: true, nom: a.nom, email: saisi, source: 'SAISI_PAR_ADMIN' };
  }

  // 1) Le signataire EST l'apprenant : son adresse est celle de sa fiche.
  if (SOURCES_APPRENANT.has(a.source)) {
    const email = texteNonVide(a.apprenant?.email);
    if (email !== null) return { ok: true, nom: a.nom, email, source: 'PERSON' };
    return { ok: false, error: refusEmailApprenant(a.nom) };
  }

  // 2) Le contact qui PORTE le nom du représentant résolu, où qu'il soit dans la
  //    liste. Lui seul : pas de repli sur un autre contact, même joignable.
  const clefRepresentant = clefDeNom(a.nom);
  if (clefRepresentant.length > 0) {
    for (const contact of a.org.contacts) {
      const email = texteNonVide(contact.email);
      if (email === null) continue;
      if (clefDeNom(`${contact.firstName} ${contact.lastName}`) === clefRepresentant) {
        return { ok: true, nom: a.nom, email, source: 'CONTACT_NOMME' };
      }
    }
  }

  return { ok: false, error: refusEmailRepresentant(a.nom, a.org) };
}
