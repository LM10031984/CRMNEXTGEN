/**
 * L'appel d'extraction — la seule pièce du lot C qui parle au modèle.
 *
 * Elle ne touche NI la base NI Next : elle reçoit un transcript et l'état des
 * réponses, elle rend des propositions déjà passées au crible de
 * `normalize.ts`. C'est ce qui permet de la tester avec un faux `callLlm` et de
 * garder toute la logique de rejet dans des fonctions pures.
 *
 * Le cas « réponse coupée » est traité à part, et pas comme un JSON invalide :
 * la leçon du 28/08 (génération de programme) est qu'un `finishReason=length`
 * renvoyé comme « le modèle a mal répondu » envoie l'utilisateur régler les
 * mauvais paramètres, alors qu'il manquait simplement de la place.
 */

import { callLlm } from '@/lib/llm-client';

import {
  construirePromptUtilisateur,
  PROMPT_VERSION,
  questionsASoumettre,
  SortieExtractionSchema,
  SYSTEM_PROMPT_TRANSCRIPT,
} from './prompt';
import {
  normaliserExtraction,
  type PropositionIA,
  type ReponseExistante,
  type ReponseExtraite,
  type RejetExtraction,
} from './normalize';
import type { DiagnosticVariantKey } from '@qualiof/shared/diagnostic';

/**
 * De la place pour ~200 réponses courtes avec leur citation. Le questionnaire
 * complet en compte 94 : la marge absorbe les citations longues sans jamais
 * couper le JSON en deux.
 */
const MAX_TOKENS = 8000;

export interface EntreeExtraction {
  transcript: string;
  variant: DiagnosticVariantKey;
  existantes: ReponseExistante[];
}

export interface MetaExtraction {
  model: string;
  provider: string;
  durationMs: number;
  promptVersion: string;
  /** Combien de questions ont été soumises — le dénominateur du taux. */
  soumises: number;
  tokensIn?: number;
  tokensOut?: number;
}

export type ErreurExtraction =
  | 'transcript-vide'
  | 'reponse-coupee'
  | 'json-hors-format'
  | 'appel-echoue';

export type ResultatExtraction =
  | {
      ok: true;
      retenues: ReponseExtraite[];
      rejets: RejetExtraction[];
      meta: MetaExtraction;
    }
  | { ok: false; erreur: ErreurExtraction; detail?: string };

export async function extraireDuTranscript(
  entree: EntreeExtraction,
): Promise<ResultatExtraction> {
  const transcript = (entree.transcript ?? '').trim();
  if (transcript.length === 0) return { ok: false, erreur: 'transcript-vide' };

  // Le commercial a déjà répondu : on ne soumet pas la question (mode HYBRIDE),
  // et une réponse IA déjà confirmée compte comme une réponse du commercial.
  const dejaRepondues = entree.existantes
    .filter((a) => a.origin === 'COMMERCIAL' || a.confirmed)
    .map((a) => a.questionId);

  const entreePrompt = { transcript, variant: entree.variant, dejaRepondues };
  const soumises = questionsASoumettre(entreePrompt).length;

  let r;
  try {
    r = await callLlm({
      tier: 'quality',
      systemPrompt: SYSTEM_PROMPT_TRANSCRIPT,
      prompt: construirePromptUtilisateur(entreePrompt),
      jsonOutput: true,
      // Une extraction n'a pas à être créative : on veut la même lecture du
      // même transcript deux fois de suite.
      temperature: 0.1,
      maxTokens: MAX_TOKENS,
    });
  } catch (e) {
    return { ok: false, erreur: 'appel-echoue', detail: e instanceof Error ? e.message : String(e) };
  }

  if (r.finishReason === 'length') {
    return {
      ok: false,
      erreur: 'reponse-coupee',
      detail: 'Le modèle a atteint sa limite de réponse : le transcript est trop long.',
    };
  }

  const parsed = SortieExtractionSchema.safeParse(r.parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      erreur: 'json-hors-format',
      detail: parsed.error.issues
        .slice(0, 3)
        .map((i) => i.path.join('.') || '(racine)')
        .join(', '),
    };
  }

  const { retenues, rejets } = normaliserExtraction({
    propositions: parsed.data.reponses as PropositionIA[],
    transcript,
    variant: entree.variant,
    existantes: entree.existantes,
  });

  return {
    ok: true,
    retenues,
    rejets,
    meta: {
      model: r.model,
      provider: r.provider,
      durationMs: r.durationMs,
      promptVersion: PROMPT_VERSION,
      soumises,
      tokensIn: r.usageTokensIn,
      tokensOut: r.usageTokensOut,
    },
  };
}
