/**
 * Schéma Zod du déroulé pédagogique Qualiopi avec garde-fous de conformité
 * (P0.2).
 *
 * Avant ce module : `DerouleSchema` était défini localement dans
 * `apps/web/src/lib/closure/mistral-generators.ts` avec uniquement des
 * `z.string().min(N)` — c'est-à-dire AUCUNE validation sémantique. Un LLM
 * mal calibré (ou un changement de modèle vers Sonnet sans re-tuning)
 * pouvait produire un déroulé syntaxiquement valide mais qui faisait
 * tomber l'indicateur Qualiopi 2 (objectifs flous) ou l'indicateur 11
 * (évaluation des acquis manquante).
 *
 * Le schéma ici durcit la validation à 4 niveaux :
 *
 * 1. **Objectifs mesurables** : chaque séquence d'apprentissage (non-pause,
 *    non-accueil) doit contenir au moins un verbe Bloom (cf. bloom-verbs.ts).
 *    Les formulations « comprendre / connaître / sensibiliser » sont
 *    refusées explicitement.
 *
 * 2. **Évaluation non vague** : le champ `evaluation` doit être structuré.
 *    Les patterns « feedback formateur », « restitution orale », « —, à
 *    voir » seuls sont rejetés. Les pauses / accueil sont exemptés.
 *
 * 3. **Mises en situation cohérentes** : si une séquence est flaguée comme
 *    mise en situation / cas pratique, son `evaluation` DOIT référencer
 *    une grille d'observation (mot-clé « grille »).
 *
 * 4. **Invariant nbGrilles == nbMisesEnSituation** : sur le déroulé entier,
 *    le nombre de séquences identifiées comme mises en situation doit
 *    égaler le nombre de séquences dont l'évaluation référence une grille.
 *    Cet invariant traduit la règle Qualiopi : « chaque mise en situation
 *    est évaluée par une grille critériée ».
 *
 * Le schéma reste TOLÉRANT côté forme (champs string libres) — le LLM ne
 * doit pas avoir à renvoyer une structure enum complexe — mais STRICT
 * côté sémantique. Les messages d'erreur sont en français et explicites
 * pour faciliter le re-tuning des prompts.
 */

import { z } from 'zod';
import { hasMeasurableActionVerb } from './bloom-verbs';

// =============================================================================
// Helpers de détection sémantique (exportés pour tests + re-use)
// =============================================================================

/**
 * Une séquence "pause / repas / café" — exemptée de toute validation
 * sémantique d'objectifs ou d'évaluation.
 */
export function isPauseSequence(seq: { duree: string; isPause?: boolean }): boolean {
  if (seq.isPause) return true;
  const d = seq.duree.toLowerCase();
  return /pause|d[ée]jeun|repas|caf[ée]/.test(d);
}

/**
 * Une séquence "accueil" ou "bilan / clôture" — exemptée de l'invariant
 * grille mais pas de l'exigence d'objectifs mesurables.
 */
export function isAccueilOrBilan(seq: { duree: string; objectifs: string }): boolean {
  const text = `${seq.duree} ${seq.objectifs}`.toLowerCase();
  return /accueil|bilan|cl[ôo]ture|introduction g[ée]n[ée]rale|tour de table/.test(
    text,
  );
}

/**
 * Détecte si une séquence est une « mise en situation » au sens Qualiopi.
 * Heuristique : présence d'un mot-clé dans `exercice` ou `contenu`.
 *
 * Exporté pour permettre aux tests (et au front) de réutiliser la même règle.
 */
const MISE_EN_SITUATION_PATTERN =
  /mise\s+en\s+situation|cas\s+pratique|atelier(?!\s+r[ée]flexion)|jeu\s+de\s+r[ôo]le|simulation|exercice\s+d['']application|sc[ée]nario/i;

export function isMiseEnSituation(seq: { exercice: string; contenu: string }): boolean {
  return (
    MISE_EN_SITUATION_PATTERN.test(seq.exercice) ||
    MISE_EN_SITUATION_PATTERN.test(seq.contenu)
  );
}

/**
 * Détecte si l'évaluation d'une séquence référence une grille critériée.
 * Toute formulation « grille d'observation / grille d'évaluation / grille
 * critères » compte.
 */
const GRILLE_PATTERN = /grille\s+(d[''])?(observation|[ée]valuation|crit[èe]re)/i;

export function evaluationReferencesGrille(evaluation: string): boolean {
  return GRILLE_PATTERN.test(evaluation);
}

/**
 * Détecte les évaluations vagues — interdites sur les séquences
 * d'apprentissage. Une évaluation est vague si :
 *   - elle fait moins de 15 caractères significatifs
 *   - ou elle se résume à un pattern flou unique (« — », « feedback
 *     formateur », « restitution orale », « à voir », « débrief »)
 */
const VAGUE_EVALUATION_PATTERNS: RegExp[] = [
  /^[\s—\-_.]*$/, // que des tirets / espaces
  /^(feedback|retour)\s+(du\s+)?formateur\.?$/i,
  /^restitution\s+(orale|collective)\.?$/i,
  /^[àa]\s+voir\.?$/i,
  /^d[ée]brief(\s+oral)?\.?$/i,
  /^[ée]valuation\s+(orale|informelle)\.?$/i,
  /^observation\s+du\s+formateur\.?$/i,
];

export function isVagueEvaluation(evaluation: string): boolean {
  const trimmed = evaluation.trim();
  if (trimmed.length < 15) return true;
  return VAGUE_EVALUATION_PATTERNS.some((re) => re.test(trimmed));
}

// =============================================================================
// Schéma de base (champs libres) — la validation sémantique se fait dans
// les refines ci-dessous.
// =============================================================================

const SequenceBaseSchema = z.object({
  duree: z.string().min(3),
  objectifs: z.string(),
  contenu: z.string(),
  outils: z.string(),
  exercice: z.string(),
  evaluation: z.string(),
  isPause: z.boolean().optional(),
});

const JourBaseSchema = z.object({
  theme: z.string().min(5),
  sequences: z.array(SequenceBaseSchema).min(5),
});

// =============================================================================
// Refines — la couche de conformité Qualiopi
// =============================================================================

/**
 * Refine 1 : chaque séquence d'apprentissage doit avoir des objectifs
 * exprimés avec au moins un verbe Bloom mesurable.
 *
 * Exemptions : pauses, accueil, bilan (où les « objectifs » sont
 * typiquement organisationnels — pas pédagogiques).
 */
function refineObjectifsBloom(
  data: z.infer<typeof DerouleBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  data.jours.forEach((jour, jIdx) => {
    jour.sequences.forEach((seq, sIdx) => {
      if (isPauseSequence(seq) || isAccueilOrBilan(seq)) return;

      const check = hasMeasurableActionVerb(seq.objectifs);
      if (!check.ok) {
        const msg = check.vagueDetected
          ? `Objectif non mesurable : commence par le verbe vague « ${check.vagueDetected} ». Reformule avec un verbe Bloom (identifier, appliquer, analyser, élaborer…).`
          : `Aucun verbe d'action mesurable détecté dans les objectifs. Indicateur Qualiopi 2 : reformule avec un verbe Bloom en tête de chaque puce.`;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jours', jIdx, 'sequences', sIdx, 'objectifs'],
          message: msg,
        });
      }
    });
  });
}

/**
 * Refine 2 : l'évaluation d'une séquence d'apprentissage doit être concrète,
 * pas un pattern vague (« feedback formateur », « restitution orale »…).
 *
 * Pauses et accueil exemptés.
 */
function refineEvaluationConcrete(
  data: z.infer<typeof DerouleBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  data.jours.forEach((jour, jIdx) => {
    jour.sequences.forEach((seq, sIdx) => {
      if (isPauseSequence(seq)) return;
      if (isAccueilOrBilan(seq)) return;

      if (isVagueEvaluation(seq.evaluation)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jours', jIdx, 'sequences', sIdx, 'evaluation'],
          message: `Évaluation trop vague (« ${seq.evaluation.trim().slice(0, 40)} »). Indicateur Qualiopi 11 : précise les modalités (QCM N questions, grille d'observation à N critères, restitution écrite évaluée, etc.).`,
        });
      }
    });
  });
}

/**
 * Refine 3 : si une séquence est une mise en situation, son évaluation DOIT
 * référencer une grille critériée. C'est la condition Qualiopi pour évaluer
 * des compétences pratiques.
 */
function refineMiseEnSituationHasGrille(
  data: z.infer<typeof DerouleBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  data.jours.forEach((jour, jIdx) => {
    jour.sequences.forEach((seq, sIdx) => {
      if (isPauseSequence(seq)) return;

      if (isMiseEnSituation(seq) && !evaluationReferencesGrille(seq.evaluation)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jours', jIdx, 'sequences', sIdx, 'evaluation'],
          message:
            'Séquence identifiée comme mise en situation / cas pratique mais l\'évaluation ne référence pas de grille critériée. Indicateur Qualiopi 11 : cite explicitement « grille d\'observation » ou « grille d\'évaluation à N critères ».',
        });
      }
    });
  });
}

/**
 * Refine 4 : invariant global — `nb mises en situation == nb grilles`.
 * Sur l'ensemble du déroulé, chaque mise en situation doit être appariée
 * à une grille, et réciproquement (pas de grille orpheline).
 */
function refineInvariantGrillesEqualsMises(
  data: z.infer<typeof DerouleBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  let nbMises = 0;
  let nbGrilles = 0;

  data.jours.forEach((jour) => {
    jour.sequences.forEach((seq) => {
      if (isPauseSequence(seq)) return;
      if (isMiseEnSituation(seq)) nbMises += 1;
      if (evaluationReferencesGrille(seq.evaluation)) nbGrilles += 1;
    });
  });

  if (nbMises !== nbGrilles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['jours'],
      message: `Invariant Qualiopi rompu : ${nbMises} mise(s) en situation détectée(s) mais ${nbGrilles} grille(s) d'évaluation référencée(s). Chaque mise en situation doit être appariée à une grille critériée (et inversement, pas de grille orpheline).`,
    });
  }
}

// Base schema sans refines — exporté pour usage interne aux refines (z.infer).
const DerouleBaseSchema = z.object({
  jours: z.array(JourBaseSchema).min(1),
});

/**
 * Schéma Qualiopi-strict du déroulé pédagogique. À utiliser SYSTEMATIQUEMENT
 * en sortie d'un générateur LLM, AVANT toute écriture en BDD ou rendu PDF.
 */
export const DerouleSchema = DerouleBaseSchema.superRefine((data, ctx) => {
  refineObjectifsBloom(data, ctx);
  refineEvaluationConcrete(data, ctx);
  refineMiseEnSituationHasGrille(data, ctx);
  refineInvariantGrillesEqualsMises(data, ctx);
});

export type Deroule = z.infer<typeof DerouleSchema>;
export type DerouleJour = z.infer<typeof JourBaseSchema>;
export type DerouleSequence = z.infer<typeof SequenceBaseSchema>;
