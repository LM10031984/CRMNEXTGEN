/**
 * « Renseigner le financeur de {organisation} → » — la FORME D'URL, module NEUTRE.
 *
 * POURQUOI UN SECOND CONTRAT, ET PAS UNE EXTENSION DU PREMIER. C.2b-5 a publié
 * `lien-corriger-financeur.ts` : il ouvre le formulaire d'INSCRIPTION, sur la
 * MÊME page, d'où ses paramètres `tab=` (l'onglet porteur) et `retour=`
 * (l'onglet où revenir). Ici la cible est une AUTRE PAGE — la fiche
 * organisation — qui n'a ni onglets ni formulaire d'inscription. Les deux
 * paramètres n'y auraient aucun sens, et les y traîner ferait croire qu'il
 * existe un onglet « Avant » sur une fiche organisation.
 *
 * CE QU'IL FAUT SAVOIR AVANT DE TOUCHER À CE FICHIER : le RETOUR ne s'invente
 * pas. Le dépôt a déjà sa convention — `?from=` (`withFrom` / `parseFrom` /
 * `<BackToListLink>`), en service sur les fiches apprenant, facture, devis. On
 * la RÉUTILISE. Un second mécanisme de retour, c'est un second endroit où
 * décider ce qu'est une destination interne acceptable, donc un second endroit
 * où oublier de refuser `javascript:` et `//host`.
 *
 * FORME RETENUE — c'est elle que le lien du bloc Signature utilise :
 *
 *   /app/organisations/{organizationId}?champ=financeur&from={retour encodé}
 *
 *   • `champ=financeur` le champ mis en évidence. MÊME MOT que sur
 *                       l'inscription : un seul vocabulaire pour « le champ
 *                       financeur », quel que soit l'écran qui le porte. Il
 *                       désigne le champ `opcoCode` du formulaire.
 *   • `from=`           le chemin de retour, ENCODÉ, validé à l'arrivée par
 *                       `parseFrom` — typiquement
 *                       `/app/sessions/{sessionId}?tab=avant`.
 *
 * ⚠ LE PIÈGE DE C.2b-5 NE SE REPOSE PAS ICI. Là-bas, `tab=session` était
 * obligatoire parce que les panneaux d'onglet inactifs sont rendus `hidden`
 * (donc `display:none`), ce qui masque jusqu'aux enfants `position:fixed` : une
 * modale ouverte depuis le mauvais onglet était réellement ouverte et
 * totalement invisible. Sur `/app/organisations/{id}` il n'y a pas d'onglet.
 * Ce qui doit être vérifié, en revanche, c'est le RETOUR — et il l'est, à
 * l'ARRIVÉE, dans `edit-organization-financeur.test.tsx`.
 *
 * ⚠ MODULE SANS `'use client'` : lu par le composant client
 * (`EditOrganizationButton`) ET par le bloc Signature.
 */

import { coerceTab, type SessionTabId } from '@/components/sessions/tabs/session-tabs-config';
import { withFrom } from '@/lib/nav/from-link';
import { CHAMP_FINANCEUR, PARAM_CHAMP } from './lien-corriger-financeur';

/**
 * Le mot du paramètre et sa valeur sont REPRIS du contrat de l'inscription, pas
 * recopiés : « champ=financeur » veut dire la même chose sur les deux écrans.
 */
export { CHAMP_FINANCEUR, PARAM_CHAMP };

/**
 * Le `name` du champ VISÉ dans le formulaire d'organisation.
 *
 * `opcoCode` est le nom de la colonne — il tient l'AGEFICE, qui n'est pas un
 * OPCO. C'est pour ça que l'URL parle de `financeur` et que l'écran, lui,
 * affiche « Financeur (OPCO, AGEFICE…) » : le mot de la base ne remonte pas.
 */
export const NOM_CHAMP_FINANCEUR_ORG = 'opcoCode';

/** Le libellé du champ sur la fiche organisation — figé, et partagé. */
export const LIBELLE_CHAMP_FINANCEUR_ORG = 'Financeur (OPCO, AGEFICE…)';

/**
 * Le libellé du lien. Il NOMME l'organisation, parce que l'avertissement qui le
 * porte peut viser n'importe laquelle des organisations d'une session : « allez
 * renseigner le financeur » sans dire lequel oblige à refaire le raisonnement.
 *
 * Sans nom utilisable, on ne fabrique pas « de  → » : on retombe sur une
 * formulation vraie.
 */
export function libelleLienRenseignerFinanceur(nomOrganisation: string | null | undefined): string {
  const nom = (nomOrganisation ?? '').trim();
  if (nom.length === 0) return "Renseigner le financeur de l'organisation commanditaire →";
  return `Renseigner le financeur de ${nom} →`;
}

/**
 * Le chemin de retour vers un onglet de la fiche session — à passer en
 * `retourVers`.
 *
 * L'onglet par défaut ne s'écrit pas : même convention que `<SessionTabs>` et
 * que `queryApresEdition`. Une URL de retour qui traînerait `?tab=session`
 * réapparaîtrait telle quelle dans la barre d'adresse de l'utilisateur.
 */
export function retourVersOnglet(sessionId: string, onglet: SessionTabId): string {
  const valide = coerceTab(onglet);
  const base = `/app/sessions/${sessionId}`;
  return valide === 'session' ? base : `${base}?tab=${valide}`;
}

/**
 * L'URL qui ouvre la fiche organisation, champ financeur en évidence.
 *
 * `retourVers` passe par `withFrom`, donc par `parseFrom` : une origine externe
 * (`https://…`), un `//host` ou un caractère de contrôle sont SILENCIEUSEMENT
 * écartés — le lien reste valide, il perd seulement son retour. C'est le bon
 * arbitrage : un open redirect est pire qu'un bouton « Retour à la liste ».
 */
export function lienRenseignerFinanceur(opts: {
  organizationId: string;
  /** Chemin interne où revenir. Omis = pas de fil d'Ariane. */
  retourVers?: string | null;
}): string {
  const base = `/app/organisations/${opts.organizationId}?${PARAM_CHAMP}=${CHAMP_FINANCEUR}`;
  return withFrom(base, opts.retourVers ?? null);
}

/** Le `?champ=` de l'URL désigne-t-il le financeur ? Rien d'autre n'ouvre. */
export function champFinanceurEnEvidence(brut: string | null | undefined): boolean {
  return (brut ?? '').trim() === CHAMP_FINANCEUR;
}

/**
 * La query string à poser une fois l'édition terminée : `champ=` disparaît —
 * sinon la modale se rouvrirait à chaque rendu — et TOUT le reste est préservé,
 * `from=` en premier, sans quoi le bouton retour perdrait sa destination au
 * moment précis où l'utilisateur veut s'en servir.
 *
 * Rendue SANS le « ? » de tête ; chaîne vide = URL propre, sans query.
 */
export function queryApresEditionOrganisation(courants: URLSearchParams): string {
  const suivants = new URLSearchParams(courants.toString());
  suivants.delete(PARAM_CHAMP);
  return suivants.toString();
}
