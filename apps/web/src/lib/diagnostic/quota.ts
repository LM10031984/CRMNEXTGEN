/**
 * Plafond anti-robot du diagnostic public — module NEUTRE (zéro prisma/auth/React).
 *
 * Il vit ici, et pas dans l'action serveur, pour deux raisons :
 *  1. un fichier `'use server'` ne peut exporter que des fonctions async — il ne
 *     peut donc pas partager ses constantes avec la route de traitement ;
 *  2. la soumission (server action) et le déclenchement de l'envoi (route API)
 *     doivent appliquer EXACTEMENT le même plafond. Deux copies de la valeur,
 *     c'est deux valeurs qui divergent.
 *
 * Plafond volontairement HAUT (V5 du document de conversion). Piège de terrain :
 * sur le wifi d'un lieu — ou derrière le NAT d'un opérateur en 4G — plusieurs
 * centaines de personnes sortent avec LA MÊME IP publique. Un soir de salon
 * privé de cinq heures, le risque robot est nul ; le risque réel, c'est de
 * bloquer le stand au 81ᵉ visiteur. On garde un garde-fou anti-remplissage
 * automatisé, pas un garde-fou anti-succès.
 */

import { rateLimitOk } from '@/lib/enrollment/rate-limit';

export const MAX_PAR_IP = 250;
export const FENETRE_MS = 15 * 60_000;

/**
 * Portées SÉPARÉES : soumettre le formulaire et déclencher l'envoi du programme
 * sont deux appels du même prospect. S'ils partageaient le même compteur, un
 * parcours normal consommerait deux jetons et le plafond réel serait divisé par
 * deux.
 */
export type PorteeDiagnostic = 'soumission' | 'traitement';

export function quotaDiagnosticOk(portee: PorteeDiagnostic, ip: string): boolean {
  return rateLimitOk(`diagnostic:${portee}:${ip}`, MAX_PAR_IP, FENETRE_MS);
}

/** Première IP de `x-forwarded-for`, ou `'inconnue'` (dev, tests). */
export function ipDepuisHeaders(h: Headers): string {
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue';
}
