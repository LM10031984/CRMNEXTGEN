/**
 * « Qui signe cette pièce, et à quelle adresse » — module PUR, DEUX APPELANTS.
 * Extraction de `signature-envoi.ts` (lot C.2a), correction n°4 du retour
 * d'écran Laurent du 11/09/2026.
 *
 * POURQUOI IL EXISTE. Laurent veut lire le signataire et son adresse SUR LA
 * LIGNE du bloc « Signature », avant d'ouvrir quoi que ce soit : « c'est ce qui
 * permet de repérer une mauvaise adresse d'un coup d'œil. » L'information
 * existait déjà, mais uniquement dans le moteur d'envoi, derrière deux
 * fonctions privées — et un fichier `'use server'` ne peut exporter que des
 * server actions. La fiche session n'avait donc aucun moyen de la lire.
 *
 * EXTRACTION À COMPORTEMENT CONSTANT, PAS RÉÉCRITURE. Les deux corps sont repris
 * tels quels ; seul le type d'entrée est nommé (`ParticipantPourSignataire`,
 * satisfait structurellement par le `ParticipantCharge` du moteur). L'autre
 * option — recopier la cascade dans `page.tsx` — aurait créé une DEUXIÈME règle
 * « qui signe », et l'écran aurait fini par annoncer un signataire différent de
 * celui qui reçoit le lien. C'est exactement la divergence que le lot C.2a a
 * supprimée pour `representant.ts` et le lot C.2b-1 pour le régime.
 *
 * PUR : ni Prisma, ni réseau, ni horloge. Les cascades qu'il enchaîne
 * (`representant.ts`) le sont déjà ; ce module ne fait que choisir laquelle
 * s'applique, et ce choix se lit sur la FORME du document et sur le RÔLE du
 * régime — jamais sur le nombre d'inscrits couverts.
 */

import {
  resoudreEmailRepresentant,
  resoudreRepresentantEntreprise,
  resoudreRepresentantIndividuel,
  resoudreStagiaire,
  type Apprenant,
  type OrganisationRepresentee,
} from './representant';
import type { EnvoiPlanifie } from './plan-envoi';
import type { DocTypeSignable } from './regime';
import type { SignataireResolu } from './envoi-contrats';

/**
 * Une inscription, réduite à ce que la résolution du signataire en lit.
 *
 * `relevantDeLaConvention` est FOURNI, jamais recalculé ici : il sort de
 * `releveDeLaConvention` (règle payeur du 12/08), la même fonction qui a décidé
 * de la forme AU MOMENT DE LA GÉNÉRATION du document.
 */
export interface ParticipantPourSignataire {
  id: string;
  /** « Prénom NOM » — sert aux refus nominatifs. */
  nom: string;
  apprenant: Apprenant;
  /** L'organisation bénéficiaire, dans la forme attendue par la cascade. */
  org: OrganisationRepresentee | null;
  estEiSelfChezSponsor: boolean;
  relevantDeLaConvention: boolean;
}

/**
 * Une convention prend deux formes selon la règle payeur du 12/08 : GROUPE
 * (l'entreprise commande pour ses salariés) ou INDIVIDUEL (l'apprenant se forme
 * à ses frais). On ne devine pas : on interroge `releveDeLaConvention`, la même
 * fonction qui a décidé de la forme AU MOMENT DE LA GÉNÉRATION.
 */
export type FormeDocument =
  | { forme: 'GROUPE'; organizationId: string }
  | { forme: 'INDIVIDUEL'; participantId: string };

export function formeDuDocument(
  envoi: EnvoiPlanifie,
  couverts: readonly ParticipantPourSignataire[],
): { ok: true; forme: FormeDocument } | { ok: false; error: string } {
  if (envoi.cible.kind === 'PARTICIPANT') {
    return { ok: true, forme: { forme: 'INDIVIDUEL', participantId: envoi.cible.participantId } };
  }
  if (couverts.some((p) => p.relevantDeLaConvention)) {
    return { ok: true, forme: { forme: 'GROUPE', organizationId: envoi.cible.organizationId } };
  }
  // Aucun salarié : la pièce est un contrat individuel. Un seul inscrit ⇒ c'est
  // le sien. Plusieurs ⇒ ils ont chacun le leur et une pièce unique ne peut pas
  // les couvrir : on le DIT, plutôt que d'en envoyer une au hasard.
  const premier = couverts[0];
  if (couverts.length === 1 && premier !== undefined) {
    return { ok: true, forme: { forme: 'INDIVIDUEL', participantId: premier.id } };
  }
  const noms = couverts.map((p) => p.nom).join(', ');
  return {
    ok: false,
    error:
      `${noms} se forment à leurs frais sous la même organisation : chacun a son propre ` +
      `contrat de formation, aucune pièce unique ne peut les couvrir. Envoyez-les séparément.`,
  };
}

/**
 * Le couple nom + adresse du signataire côté bénéficiaire, avec la provenance
 * des DEUX moitiés — de quoi journaliser, et de quoi afficher.
 *
 * NE REFUSE JAMAIS EN SILENCE : chaque impasse rend le message nominatif de
 * `representant.ts`, qui nomme la personne, l'entreprise, et le geste à faire.
 */
export function resoudreSignataireClient(a: {
  docType: DocTypeSignable;
  forme: FormeDocument;
  envoi: EnvoiPlanifie;
  couverts: readonly ParticipantPourSignataire[];
  emailSaisi?: string | null;
}): { ok: true; signataire: SignataireResolu } | { ok: false; error: string } {
  const premier = a.couverts[0];
  if (premier === undefined) {
    return {
      ok: false,
      error: `Aucun inscrit rattaché à « ${a.envoi.libelle} » : rien à envoyer.`,
    };
  }

  // Le Document EXISTANT décide de la cascade — pas une heuristique. Le
  // signataire est ainsi, par construction, celui que le PDF nomme.
  const org: OrganisationRepresentee = premier.org ?? {
    id: a.envoi.cible.kind === 'ORGANISATION' ? a.envoi.cible.organizationId : premier.id,
    legalName: a.envoi.libelle,
    representative: null,
    contacts: [],
  };

  const nomResolu =
    a.docType === 'CONVENTION' && a.forme.forme === 'GROUPE'
      ? resoudreRepresentantEntreprise(org)
      : a.envoi.role === 'DIRIGEANT'
        ? resoudreRepresentantIndividuel({
            org,
            apprenant: premier.apprenant,
            estEiSelf: premier.estEiSelfChezSponsor,
          })
        : resoudreStagiaire(premier.apprenant);
  if (!nomResolu.ok) return { ok: false, error: nomResolu.error };

  const email = resoudreEmailRepresentant({
    nom: nomResolu.nom,
    source: nomResolu.source,
    org,
    apprenant: premier.apprenant,
    emailSaisi: a.emailSaisi ?? null,
  });
  if (!email.ok) return { ok: false, error: email.error };

  return {
    ok: true,
    signataire: {
      nom: email.nom,
      email: email.email,
      sourceNom: nomResolu.source,
      sourceEmail: email.source,
    },
  };
}
