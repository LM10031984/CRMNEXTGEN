/**
 * Objectifs proposés et préconisations par collaborateur — fonction pure.
 *
 * La page « performance de votre équipe » (§9.2, inspirée du business review
 * KW) sortait avec deux colonnes entièrement vides : les productions N-1
 * étaient là, mais personne n'avait saisi d'objectif ni de commentaire. Une
 * page d'audit qui n'affiche que des tirets ne vaut pas d'être remise.
 *
 * Ce qui se calcule ici est donc une PROPOSITION, dérivée de deux repères
 * simples et vérifiables :
 *   • l'objectif : la production N-1 de la personne portée par l'ambition de
 *     croissance de l'agence (objectif d'agence / CA N-1). Si le dirigeant vise
 *     +25 %, chacun se voit proposer +25 % — c'est le point de départ d'un
 *     entretien, pas une répartition savante qui ferait semblant de connaître
 *     les portefeuilles ;
 *   • la préconisation : la position de la personne par rapport à la moyenne
 *     de l'équipe, qui est ce qu'un dirigeant regarde en premier.
 *
 * Deux garde-fous :
 *   • ce que l'humain a saisi gagne toujours sur la règle (`strengths`,
 *     `priorityNeed`, `objectiveCa` renseignés en rendez-vous) ;
 *   • aucun appel IA — c'est une règle arithmétique, pas une rédaction (L-5).
 *     Rien à relire, donc, mais tout à valider avec la personne concernée :
 *     le rapport le dit explicitement sous le tableau.
 */

export interface TeamObjectiveInput {
  displayName: string;
  statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
  caN1: number | null;
  /** Saisi en rendez-vous — prioritaire sur la règle. */
  objectiveCa: number | null;
  strengths: string | null;
  priorityNeed: string | null;
}

export interface TeamObjectiveLine {
  displayName: string;
  statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
  caN1: number | null;
  /** Objectif retenu — saisi s'il existe, proposé sinon, `null` si indécidable. */
  objectiveCa: number | null;
  /** Vrai quand l'objectif vient de la règle et non de la saisie. */
  objectiveIsProposed: boolean;
  /** Constat + préconisation, une phrase. `null` si rien de vérifiable à dire. */
  recommendation: string | null;
}

export interface TeamObjectives {
  lines: TeamObjectiveLine[];
  /**
   * Faux quand aucune ligne ne porte ni objectif ni préconisation : le
   * template masque alors les deux colonnes plutôt que d'aligner des tirets.
   */
  hasContent: boolean;
  /** Taux de croissance appliqué (0.25 = +25 %), `null` si non calculable. */
  growthRate: number | null;
}

/** Arrondi commercial : un objectif se dit en milliers d'euros. */
function roundToThousand(n: number): number {
  return Math.round(n / 1000) * 1000;
}

const pct = (n: number) => Math.round(n * 100);

export function buildTeamObjectives(args: {
  participants: TeamObjectiveInput[];
  revenueN1: number | null;
  revenueGoal: number | null;
}): TeamObjectives {
  const { participants, revenueN1, revenueGoal } = args;

  // L'ambition de l'agence, ramenée à un taux. On refuse une croissance
  // négative ou absurde comme base d'objectif individuel : dans ce cas on ne
  // propose rien plutôt que de proposer une baisse à chacun.
  const growthRate =
    revenueN1 !== null && revenueGoal !== null && revenueN1 > 0 && revenueGoal > revenueN1
      ? (revenueGoal - revenueN1) / revenueN1
      : null;

  const producers = participants.filter(
    (p): p is TeamObjectiveInput & { caN1: number } => p.caN1 !== null && p.caN1 > 0,
  );
  const average =
    producers.length > 0 ? producers.reduce((s, p) => s + p.caN1, 0) / producers.length : null;

  const lines = participants.map((p): TeamObjectiveLine => {
    const proposed =
      p.objectiveCa === null && p.caN1 !== null && p.caN1 > 0 && growthRate !== null
        ? roundToThousand(p.caN1 * (1 + growthRate))
        : null;

    return {
      displayName: p.displayName,
      statut: p.statut,
      caN1: p.caN1,
      objectiveCa: p.objectiveCa ?? proposed,
      objectiveIsProposed: p.objectiveCa === null && proposed !== null,
      recommendation: buildRecommendation(p, average),
    };
  });

  return {
    lines,
    hasContent: lines.some((l) => l.objectiveCa !== null || l.recommendation !== null),
    growthRate,
  };
}

/**
 * Le constat : où se situe la personne, et ce qu'on en fait.
 *
 * Ce qui a été observé en rendez-vous passe devant. À défaut, on ne dit que ce
 * que les chiffres permettent de dire — et on ne dit rien du tout quand il n'y
 * a pas de chiffre : une phrase générique dans un audit à 3 000 € s'entend
 * comme du remplissage.
 */
function buildRecommendation(p: TeamObjectiveInput, average: number | null): string | null {
  const saisi = [p.strengths?.trim(), p.priorityNeed?.trim() ? `Besoin prioritaire : ${p.priorityNeed.trim()}` : null]
    .filter((x): x is string => Boolean(x))
    .join(' — ');
  if (saisi) return saisi;

  if (p.caN1 === null || p.caN1 <= 0 || average === null || average <= 0) return null;

  const ratio = p.caN1 / average;
  if (ratio < 0.6) {
    return `Production à ${pct(ratio)} % de la moyenne de l'équipe : c'est là que le point d'écart est le plus grand. Reprendre la régularité de la prospection avant tout autre chantier.`;
  }
  if (ratio < 0.9) {
    return `Production un peu sous la moyenne de l'équipe (${pct(ratio)} %). Le levier le plus court est la part de mandats exclusifs.`;
  }
  if (ratio <= 1.15) {
    return `Production dans la moyenne de l'équipe. La marge se joue sur la qualité du stock plutôt que sur le volume d'entrées.`;
  }
  return `Meilleure production de l'équipe (${pct(ratio)} % de la moyenne). À faire essaimer : binôme sur les découvertes vendeur et partage de méthode.`;
}
