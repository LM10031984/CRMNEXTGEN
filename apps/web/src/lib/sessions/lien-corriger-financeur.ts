/**
 * « Corriger le financeur de l'inscription → » — la FORME D'URL, module NEUTRE.
 *
 * POURQUOI L'OUVERTURE EST PILOTÉE PAR L'URL, ET PAS PAR UN ÉTAT LOCAL. Le
 * formulaire d'édition d'une inscription vit dans la liste des inscrits, sur
 * l'onglet « Session ». L'avertissement qui pousse à le corriger, lui, vit dans
 * le bloc Signature de l'onglet « Avant ». Un état local ne franchit pas cette
 * distance : le lien doit pouvoir dire « ouvre CE formulaire, sur CE
 * participant, ce champ-là en évidence », et être partageable, rejouable, et
 * survivre au `router.refresh()` que déclenche chaque génération de document.
 * C'est exactement le raisonnement qui a fait passer les onglets à `?tab=`
 * (Phase 15 Lot 1) — même mécanique, même module neutre.
 *
 * ⚠ MODULE SANS `'use client'`, et c'est délibéré : il est lu À LA FOIS par le
 * composant client (`EditParticipantButton`) et par le futur appelant serveur
 * qui rendra le lien. Une fonction exportée d'un module `'use client'` et
 * importée par un composant serveur devient une référence proxy non appelable
 * (cf. l'avertissement en tête de `session-tabs-config.ts`).
 *
 * FORME RETENUE — c'est elle que le lien utilisera :
 *
 *   /app/sessions/{sessionId}?tab=session&inscription={participantId}&champ=financeur&retour=avant
 *
 *   • `tab=session`   l'onglet qui PORTE le formulaire. Non négociable : les
 *                     panneaux inactifs sont rendus `hidden` (donc
 *                     `display:none`), ce qui masque jusqu'aux enfants
 *                     `position:fixed` — une modale ouverte depuis un panneau
 *                     caché serait invisible.
 *   • `inscription=`  l'inscription dont le formulaire s'ouvre. Comparée à
 *                     l'id de CHAQUE ligne : une seule s'ouvre.
 *   • `champ=`        le champ mis en évidence (`financeur` aujourd'hui).
 *   • `retour=`       l'onglet où revenir une fois l'édition terminée.
 */

import { coerceTab, type SessionTabId } from '@/components/sessions/tabs/session-tabs-config';

export const PARAM_ONGLET = 'tab';
export const PARAM_INSCRIPTION = 'inscription';
export const PARAM_CHAMP = 'champ';
export const PARAM_RETOUR = 'retour';

/** La seule valeur de `champ=` reconnue à ce jour. */
export const CHAMP_FINANCEUR = 'financeur';

/** L'onglet qui porte la liste des inscrits, donc le formulaire d'édition. */
export const ONGLET_PORTEUR: SessionTabId = 'session';

/** Le libellé du lien, partagé pour que l'appelant n'en invente pas un autre. */
export const LIBELLE_LIEN_CORRIGER_FINANCEUR = "Corriger le financeur de l'inscription →";

/**
 * L'URL qui ouvre le formulaire d'édition d'une inscription, champ « Financeur
 * de l'inscription » en évidence.
 */
export function lienCorrigerFinanceur(opts: {
  sessionId: string;
  participantId: string;
  /** Onglet où revenir après enregistrement. Omis = on reste sur « Session ». */
  retour?: SessionTabId;
}): string {
  const params = new URLSearchParams();
  params.set(PARAM_ONGLET, ONGLET_PORTEUR);
  params.set(PARAM_INSCRIPTION, opts.participantId);
  params.set(PARAM_CHAMP, CHAMP_FINANCEUR);
  if (opts.retour) params.set(PARAM_RETOUR, coerceTab(opts.retour));
  return `/app/sessions/${opts.sessionId}?${params.toString()}`;
}

/**
 * L'onglet de retour lu dans l'URL — VALIDÉ, jamais repris tel quel : `?retour=`
 * vient de la barre d'adresse, donc de n'importe où.
 * `null` quand le paramètre est absent (il n'y a alors nulle part où revenir).
 */
export function ongletDeRetour(brut: string | null | undefined): SessionTabId | null {
  const valeur = (brut ?? '').trim();
  if (valeur.length === 0) return null;
  return coerceTab(valeur);
}

/**
 * La query string à poser une fois l'édition terminée : le formulaire se
 * referme (ses trois paramètres disparaissent) et l'onglet de retour prend la
 * main. Les autres paramètres de l'URL sont PRÉSERVÉS — `?from=` notamment, qui
 * porte le fil d'Ariane.
 *
 * Rendue SANS le « ? » de tête ; chaîne vide = URL propre, sans query.
 */
export function queryApresEdition(courants: URLSearchParams): string {
  const suivants = new URLSearchParams(courants.toString());
  const retour = ongletDeRetour(suivants.get(PARAM_RETOUR));

  suivants.delete(PARAM_INSCRIPTION);
  suivants.delete(PARAM_CHAMP);
  suivants.delete(PARAM_RETOUR);

  if (retour !== null) {
    // Même convention que `<SessionTabs>` : l'onglet par défaut ne s'écrit pas.
    if (retour === 'session') suivants.delete(PARAM_ONGLET);
    else suivants.set(PARAM_ONGLET, retour);
  }

  return suivants.toString();
}
