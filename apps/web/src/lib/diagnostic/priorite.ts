/**
 * Priorisation des rappels — fonction PURE (zéro prisma / auth / React), comme
 * `scoring.ts`.
 *
 * Le problème qu'elle résout : le 10 septembre au matin, il y a 60 à 100 leads
 * du salon. Les rappeler dans l'ordre d'arrivée gaspille les meilleurs. Le tri
 * se calcule à partir de réponses DÉJÀ collectées — aucune question en plus.
 *
 * Les règles (document de conversion §4) :
 *   A — rappel J+1  : a demandé « cette semaine »
 *                     OU dirigeant / équipe de 6+
 *                     OU (mandats en baisse ET aucune formation cette année)
 *   B — rappel J+2/J+3 : aucune formation cette année OU téléphone renseigné
 *   C — email seulement : le reste
 *
 * Pourquoi « aucune formation cette année » pèse autant : c'est le signal de
 * DROITS AGEFICE INTACTS. L'enveloppe est annuelle et ce qui n'est pas consommé
 * au 31/12 est perdu — c'est l'argument qui fait décrocher, pas le programme.
 *
 * Module pur ⇒ testable hors réseau. C'est de la logique commerciale : elle doit
 * être couverte, elle décide de l'ordre dans lequel Laurent passe ses appels.
 */

import type { Reponses } from './scoring';
import {
  PROBLEMATIQUES,
  RAPPEL_LIBELLE_CRM,
  type ProblematiqueKey,
  type RappelValue,
} from './questions';

export type NiveauPriorite = 'A' | 'B' | 'C';

export interface Priorite {
  niveau: NiveauPriorite;
  /** Pourquoi ce niveau — phrases lisibles, écrites dans les notes du lead. */
  motifs: string[];
}

export interface EntreePriorite {
  reponses: Reponses;
  /** Choix du prospect sur l'écran de résultat. `null` = pas encore répondu. */
  rappel: RappelValue | null;
  /** Tel que saisi. Vide = non renseigné (il est facultatif hors « cette semaine »). */
  telephone: string;
}

/** Équipes qui justifient à elles seules un rappel J+1. */
const EQUIPES_ETOFFEES = new Set(['DE_6_A_15', 'PLUS_DE_15']);

export function prioriser({ reponses, rappel, telephone }: EntreePriorite): Priorite {
  const telRenseigne = telephone.trim() !== '';
  const sansFormation = reponses.formation_annee === 'NON';

  // ── Niveau A ─────────────────────────────────────────────────────────────
  const motifsA: string[] = [];
  if (rappel === 'CETTE_SEMAINE') {
    motifsA.push('a demandé à être rappelé cette semaine');
  }
  if (reponses.role === 'DIRIGEANT') {
    motifsA.push("dirigeant ou directeur d'agence (décideur)");
  }
  if (EQUIPES_ETOFFEES.has(reponses.equipe ?? '')) {
    motifsA.push('équipe de 6 personnes ou plus');
  }
  if (reponses.mandats === 'BAISSE' && sansFormation) {
    motifsA.push('mandats en baisse et aucune formation cette année');
  }
  if (motifsA.length > 0) return { niveau: 'A', motifs: motifsA };

  // ── Niveau B ─────────────────────────────────────────────────────────────
  const motifsB: string[] = [];
  if (sansFormation) {
    motifsB.push('aucune formation cette année — droits AGEFICE probablement intacts');
  }
  if (telRenseigne) {
    motifsB.push('téléphone renseigné');
  }
  if (motifsB.length > 0) return { niveau: 'B', motifs: motifsB };

  // ── Niveau C ─────────────────────────────────────────────────────────────
  return { niveau: 'C', motifs: ['aucun signal fort — email seulement'] };
}

/**
 * La ligne que Laurent lit dans la colonne « Dernière action » de la liste des
 * leads, SANS ouvrir la fiche. Format figé :
 *
 *   `[A] Diagnostic — Rentrer plus de mandats… — rappel cette semaine`
 *
 * Le niveau est en tête pour que le tri visuel se fasse en balayant la colonne.
 */
export function ligneSuiviCrm(input: {
  niveau: NiveauPriorite;
  dominante: ProblematiqueKey;
  rappel: RappelValue | null;
}): string {
  const titre = PROBLEMATIQUES[input.dominante].titre;
  const suffixe = input.rappel ? RAPPEL_LIBELLE_CRM[input.rappel] : 'rappel non précisé';
  return `[${input.niveau}] Diagnostic — ${titre} — ${suffixe}`;
}
