/**
 * Comment l'ORGANISATION COMMANDITAIRE se nomme à l'écran — module NEUTRE.
 *
 * POURQUOI CE CHAMP A CHANGÉ DE NOM (Laurent, 11/09/2026, correction n°7 bis).
 * Il s'appelait « Financeur de l'inscription », et c'était trompeur : ce que
 * l'on choisit dans ce sélecteur n'est pas un financeur, c'est une
 * ORGANISATION — celle qui porte l'inscription et figure sur la convention. Son
 * financeur (OPCO, AGEFICE…) est une INFORMATION qu'elle porte, jamais un champ
 * à part. Le confondre avec le champ lui-même conduit à chercher « le
 * financeur » dans une liste d'organisations, et à croire qu'on peut le changer
 * depuis l'inscription — ce qui est faux : il se renseigne sur la fiche
 * organisation.
 *
 * D'OÙ LES PARENTHÈSES. Choisir entre « Agence Provence Immobilier » et
 * « ROUSSEL Camille, EI » ne dit rien des pièces à signer, alors que c'est
 * exactement ce que ce choix décide (`sponsorOrg.opcoCode` →
 * `participants-regime.ts`). Le financeur s'affiche donc DANS l'option, pour
 * que la conséquence soit lisible au moment du choix.
 *
 * ⚠ MODULE SANS `'use client'`, et c'est délibéré : il est lu par le composant
 * client (`EditParticipantButton`) et par ses tests, et il pourra l'être par un
 * appelant serveur. Une fonction exportée d'un module `'use client'` et importée
 * par un composant serveur devient une référence proxy non appelable (cf.
 * l'avertissement en tête de `session-tabs-config.ts`).
 */

import { formatFunderCode } from '@/lib/funder-codes';

/** Le libellé du champ, figé ici pour qu'il n'existe qu'à un seul endroit. */
export const LIBELLE_CHAMP_COMMANDITAIRE = 'Organisation commanditaire';

/**
 * Le texte d'aide, imposé AU MOT PRÈS par Laurent le 11/09/2026.
 *
 * Il dit d'abord CE QU'EST l'organisation (la phrase que l'admin cherche quand
 * il hésite entre l'EI et l'enseigne), puis POURQUOI son financeur compte.
 */
export const AIDE_CHAMP_COMMANDITAIRE =
  "L'organisation qui porte l'inscription et figure sur la convention. " +
  'Son financeur (OPCO, AGEFICE…) détermine les pièces à signer.';

/** L'entrée « pas de commanditaire » du sélecteur. */
export const OPTION_AUCUN_COMMANDITAIRE = '— Aucune organisation commanditaire —';

/**
 * Une option du sélecteur : l'organisation, puis SON FINANCEUR.
 *
 * ⚠ LE CODE BRUT N'EST JAMAIS MONTRÉ TEL QUEL. `formatFunderCode` rend
 * « OPCO EP » là où la base stocke `OPCO_EP` — même règle d'affichage que les
 * badges de la fiche organisation (audit 2026-05-12, UX-12). Deux écrans qui
 * épellent différemment le même financeur font douter qu'il s'agisse du même.
 *
 * Une organisation SANS financeur le DIT (« — aucun financeur ») plutôt que de
 * se taire : c'est exactement le cas — Camille ROUSSEL, Marion MAINO — où il
 * manque quelque chose, et une option muette laisserait croire que tout va bien.
 */
export function libelleOptionCommanditaire(o: { label: string; opcoCode: string | null }): string {
  const code = (o.opcoCode ?? '').trim();
  if (code.length === 0) return `${o.label} — aucun financeur`;
  return `${o.label} (${formatFunderCode(code)})`;
}
