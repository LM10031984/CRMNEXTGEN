/**
 * Les mentions Qualiopi de l'ORGANISME — fonction pure.
 *
 * Trois rubriques qu'un programme de formation doit porter, et qui ne
 * viennent pas du produit : les moyens pédagogiques, les modalités
 * d'évaluation, et l'accessibilité aux personnes en situation de handicap.
 *
 * ## Pourquoi ce fichier existe
 *
 * Le programme composé pour DIAG-0001 les sortait **vides**, et son « Public
 * visé » était recopié d'un programme de marketing digital — donc, pour une
 * agence immobilière : « Professionnels du marketing, entrepreneurs… Durée de
 * la formation : », phrase tronquée comprise.
 *
 * Une rubrique vide n'est pas un document incomplet. **L'accessibilité aux
 * personnes en situation de handicap est l'indicateur Qualiopi 26** : un
 * programme qui la laisse blanche est une non-conformité en contrôle, pas un
 * brouillon. D'où la garantie structurelle de ce module : il rend des chaînes
 * **non vides**, toujours. Le type le dit, et un test de contrat le vérifie.
 *
 * ## D'où vient le texte par défaut
 *
 * Il n'est pas rédigé ici : c'est le texte standard de Start Academy, relevé
 * verbatim dans ses propres programmes du Drive « Formations et programmes »,
 * où il est répété à l'identique sur des dizaines de documents. Le tenant peut
 * le remplacer (colonnes `Tenant.qualiopi*`) ; il ne peut pas l'effacer.
 */

/** Le contact « référent handicap » — Qualiopi 26 exige de savoir à qui écrire. */
export interface OrganismContact {
  name: string;
  email: string;
  phone: string;
}

/** Ce qu'un tenant a éventuellement saisi à la place du texte standard. */
export interface TenantQualiopiOverrides {
  qualiopiPedagogicalMethods?: string | null;
  qualiopiEvaluationMethods?: string | null;
  qualiopiAccessibility?: string | null;
}

/**
 * Les trois mentions, garanties NON VIDES.
 *
 * Le type ne porte pas de `| null` : c'est volontaire. Un appelant ne peut pas
 * « oublier » de les remplir, et le générateur de programme n'a aucun chemin
 * qui produirait une section blanche.
 */
export interface QualiopiMentions {
  pedagogicalMethods: string;
  evaluationMethods: string;
  accessibility: string;
}

/** Texte standard Start Academy — moyens pédagogiques et techniques. */
const DEFAULT_PEDAGOGICAL_METHODS = [
  'La formation se déroule en présentiel, dans les locaux de l’agence.',
  'Les formateurs proposent des mises en situation professionnelles sur les techniques de prospection, les discours et la posture, ainsi que des échanges sur les pratiques actuelles.',
  'Un livret de formation est remis à chaque participant en début de formation. Le formateur déroule sa formation avec une présentation projetée.',
].join('\n');

/** Texte standard Start Academy — modalités d’évaluation et de suivi. */
const DEFAULT_EVALUATION_METHODS = [
  '- Un test de positionnement est réalisé en début de formation ;',
  '- Une liste d’émargement est signée à la demi-journée ;',
  '- Une évaluation sous forme de QCM a lieu en fin de formation ;',
  '- Un questionnaire de satisfaction est remis à chaud, puis à froid ;',
  '- Un certificat de réalisation est délivré à chaque participant à l’issue de la formation.',
].join('\n');

/** Texte standard Start Academy — accessibilité (indicateur Qualiopi 26). */
function defaultAccessibility(contact: OrganismContact): string {
  const joignable = [contact.name, contact.email, contact.phone].filter((s) => s.trim()).join(' · ');
  return [
    'La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel » a pour objectif de faciliter l’accès à l’emploi des personnes en situation de handicap.',
    'Notre organisme donne à tous les mêmes chances d’accéder ou de maintenir l’emploi. Nous pouvons adapter certaines de nos modalités de formation : pour cela, nous étudions ensemble vos besoins.',
    joignable.length > 0
      ? `Pour toute question relative à une situation de handicap, contactez notre référent : ${joignable}.`
      : 'Pour toute question relative à une situation de handicap, contactez notre référent handicap.',
  ].join('\n');
}

/** Une valeur saisie ne compte que si elle porte du texte. */
function useful(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Les mentions applicables : ce que le tenant a saisi, sinon le texte standard.
 *
 * Jamais de troisième branche. Il n'existe aucune combinaison d'entrées qui
 * rende une chaîne vide — c'est toute la raison d'être de cette fonction.
 */
export function resolveQualiopiMentions(
  tenant: TenantQualiopiOverrides | null,
  contact: OrganismContact,
): QualiopiMentions {
  return {
    pedagogicalMethods:
      useful(tenant?.qualiopiPedagogicalMethods) ?? DEFAULT_PEDAGOGICAL_METHODS,
    evaluationMethods: useful(tenant?.qualiopiEvaluationMethods) ?? DEFAULT_EVALUATION_METHODS,
    accessibility: useful(tenant?.qualiopiAccessibility) ?? defaultAccessibility(contact),
  };
}

/** Exporté pour les tests — le texte standard, sans passer par un tenant. */
export const _defaults = {
  DEFAULT_PEDAGOGICAL_METHODS,
  DEFAULT_EVALUATION_METHODS,
  defaultAccessibility,
};
