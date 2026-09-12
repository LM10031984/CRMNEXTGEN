/**
 * Le RESPONSABLE d'une organisation, tel que sa fiche doit le dire — demande
 * n°1 de Laurent, 11/09/2026.
 *
 * LE MOT, ET POURQUOI IL CHANGE. L'écran disait « dirigeant » et « représentant
 * légal ». Les deux affirment une QUALITÉ JURIDIQUE que la donnée ne porte pas :
 * `Organization.representative` est un champ libre, et il dit seulement QUI
 * REPRÉSENTE L'ORGANISATION ET SIGNE SES CONVENTIONS. Pour un salarié, ce
 * signataire est le RESPONSABLE D'AGENCE — pas nécessairement le mandataire
 * social. Un écran qui écrit « dirigeant » fait chercher un représentant légal,
 * fait hésiter à saisir le nom qui convient, et finit par faire « corriger » une
 * cascade qui est juste.
 *
 * ⚠ CE MODULE NE DÉCIDE PAS QUI SIGNE. Il APPELLE `representant.ts` — la
 * cascade unique (`representative`, sinon le premier contact principal), celle
 * que la génération de convention et le moteur d'envoi appellent aussi. La
 * recopier ici en ferait une seconde règle, et la fiche annoncerait un jour un
 * responsable différent de celui qui reçoit le lien de signature. Seuls les
 * MESSAGES sont composés ici : ceux du moteur nomment une fiche à ouvrir, ce qui
 * n'a aucun sens quand on est déjà dessus.
 *
 * PUR : ni Prisma, ni réseau, ni horloge. C'est ce qui rend les cas tordus
 * testables en une ligne.
 */

import {
  resoudreEmailRepresentant,
  resoudreRepresentantEntreprise,
  resoudreRepresentantIndividuel,
  type Apprenant,
  type OrganisationRepresentee,
} from '@/lib/signature/representant';

/**
 * Le libellé du champ, figé à UN endroit.
 *
 * Il nomme la PERSONNE puis ce qu'elle DÉCIDE. « Responsable » seul serait
 * ambigu (responsable de quoi ?) et « Signataire » seul ferait croire à une
 * signature déjà obtenue. La seconde moitié est ce qui fait remplir le champ :
 * sans lui, aucune convention ne part.
 */
export const LIBELLE_RESPONSABLE_ORGANISATION = 'Responsable — signe les conventions';

/** Le mot, au singulier, pour les phrases courantes. Jamais « dirigeant ». */
export const MOT_RESPONSABLE_ORGANISATION = 'responsable de l’organisation';

/**
 * Ce que la fiche doit AFFIRMER, et rien de plus.
 *
 * `nom` / `email` valent `null` quand la cascade n'aboutit pas : on ne fabrique
 * pas « (responsable inconnu) », qui ferait chercher une personne qui n'existe
 * pas. `avertissement` est non nul EXACTEMENT quand quelque chose empêche un
 * envoi — jamais « pour information ». Un écran qui alerte à tort n'alerte plus.
 */
export interface VueResponsableOrganisation {
  /** `COMPLET` ⇒ une convention peut partir pour cette organisation. */
  etat: 'COMPLET' | 'SANS_EMAIL' | 'INCONNU';
  nom: string | null;
  email: string | null;
  avertissement: string | null;
}

/**
 * LA PHRASE QUI FAIT CORRIGER : le manque, sa conséquence, puis le geste.
 *
 * ⚠ « aucune convention ne peut partir en signature » n'est pas une formule de
 * politesse : c'est le comportement RÉEL du moteur depuis le lot C.2a
 * (`resoudreEmailRepresentant` refuse nominativement, sans repli sur un autre
 * contact). Avant cette phrase, l'admin l'apprenait au moment d'envoyer, sur un
 * autre écran, après avoir préparé son dossier.
 *
 * ⚠ AUCUN REPLI NOMMÉ. On ne suggère jamais « utilisez l'adresse de X » : le
 * lien envoyé chez X ferait figurer SON email et SON adresse IP dans le
 * certificat de signature, qui ne prouverait plus rien devant un financeur
 * (décision Laurent, 10/09/2026).
 */
function avertissementSansEmail(nom: string, legalName: string): string {
  return (
    `Aucune adresse email pour « ${nom} », responsable de « ${legalName} » : ` +
    `aucune convention ne peut partir en signature pour cette organisation. ` +
    `Renseignez son adresse sur le contact qui porte ce nom, ou saisissez-la au ` +
    `moment de l’envoi.`
  );
}

/**
 * Même forme, autre chemin : l'ENTREPRISE INDIVIDUELLE dont l'apprenant signe.
 *
 * CE QU'ELLE REMPLACE, ET POURQUOI (défaut D-C3-3, recette du 11/09/2026). La
 * fiche annonçait « renseignez son adresse sur le contact qui porte ce nom » —
 * or il n'y a AUCUN contact à renseigner : le moteur lit la fiche APPRENANT.
 * Envoyer l'admin vers les contacts de l'organisation, c'est l'envoyer créer
 * une donnée qui ne servira à rien.
 */
function avertissementSansEmailEiSelf(nom: string): string {
  return (
    `Aucune adresse email pour « ${nom} », qui signe pour son entreprise individuelle : ` +
    `aucune convention ne peut partir en signature. Renseignez son adresse sur sa fiche ` +
    `apprenant, ou saisissez-la au moment de l’envoi.`
  );
}

/** Même forme, autre manque : ici c'est le NOM qui n'existe pas. */
function avertissementInconnu(legalName: string): string {
  return (
    `Aucun responsable pour « ${legalName} » : aucune convention ne peut partir ` +
    `en signature pour cette organisation, et une convention sans signataire n’est ` +
    `pas opposable. Renseignez le responsable sur cette fiche, ou désignez un ` +
    `contact principal.`
  );
}

/**
 * Le responsable de cette organisation, résolu par la cascade unique.
 *
 * L'email est cherché EXACTEMENT comme le moteur le cherchera : `apprenant`
 * volontairement absent (sur la fiche organisation, il n'y a pas d'apprenant à
 * qui se rabattre) et `emailSaisi` absent (la dérogation est une décision prise
 * devant le récapitulatif d'envoi, pas un état de la fiche).
 */
export function vueResponsableOrganisation(
  org: OrganisationRepresentee,
  /**
   * L'APPRENANT QUI SIGNE POUR SON ENTREPRISE INDIVIDUELLE — défaut D-C3-3.
   *
   * Non nul quand un `LegalLink` de rôle `EI_SELF` relie cette organisation à
   * une personne. Le moteur emprunte alors l'AUTRE chemin de la cascade
   * (`resoudreRepresentantIndividuel`) et prend l'adresse de la fiche
   * apprenant : la fiche organisation annonçait le chemin des agences et
   * contredisait donc l'envoi, en promettant qu'« aucune convention ne peut
   * partir » alors qu'elles partaient.
   *
   * ⚠ OBLIGATOIRE, et `null` est la valeur normale — l'immense majorité des
   * organisations sont des agences. Ce qu'on rend impossible, c'est l'oubli :
   * optionnel, ce paramètre se serait perdu au premier appelant et la fiche
   * serait retombée en silence sur le chemin des agences (leçon C.2b-8).
   */
  apprenantEiSelf: Apprenant | null,
): VueResponsableOrganisation {
  // ⚠ L'ORDRE EST CELUI DU MOTEUR. `resoudreRepresentantIndividuel` teste
  // `estEiSelf` AVANT `representative` : le régime a déjà tranché que
  // l'apprenant signe pour lui-même. L'inverser ici ferait diverger l'écran de
  // l'envoi — la divergence même que cette correction supprime.
  if (apprenantEiSelf !== null) {
    const representant = resoudreRepresentantIndividuel({
      org,
      apprenant: apprenantEiSelf,
      estEiSelf: true,
    });
    // Ce chemin ne refuse jamais le NOM : il y a toujours un apprenant.
    const nom = representant.ok ? representant.nom : null;
    const adresse = representant.ok
      ? resoudreEmailRepresentant({
          nom: representant.nom,
          source: representant.source,
          org,
          apprenant: apprenantEiSelf,
        })
      : null;
    if (nom === null) return { etat: 'INCONNU', nom: null, email: null, avertissement: avertissementInconnu(org.legalName) };
    if (adresse === null || !adresse.ok) {
      return {
        etat: 'SANS_EMAIL',
        nom,
        email: null,
        avertissement: avertissementSansEmailEiSelf(nom),
      };
    }
    return { etat: 'COMPLET', nom, email: adresse.email, avertissement: null };
  }

  const representant = resoudreRepresentantEntreprise(org);
  if (!representant.ok) {
    return {
      etat: 'INCONNU',
      nom: null,
      email: null,
      avertissement: avertissementInconnu(org.legalName),
    };
  }

  const adresse = resoudreEmailRepresentant({
    nom: representant.nom,
    source: representant.source,
    org,
  });
  if (!adresse.ok) {
    return {
      etat: 'SANS_EMAIL',
      nom: representant.nom,
      email: null,
      avertissement: avertissementSansEmail(representant.nom, org.legalName),
    };
  }

  return { etat: 'COMPLET', nom: representant.nom, email: adresse.email, avertissement: null };
}
