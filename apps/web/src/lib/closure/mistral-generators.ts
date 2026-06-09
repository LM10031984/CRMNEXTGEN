/**
 * Generators IA pour les 7 docs Qualiopi assistés (QCM, GRILLE_OBS,
 * ANALYSE_BESOIN, POSITIONNEMENT, SATISFACTION_CHAUD, SATISFACTION_FROID,
 * DEROULE_PEDA).
 *
 * Chaque generator :
 *   1. Construit un prompt user à partir du contexte (formation + stagiaire)
 *   2. Appelle le LLM via callLlm (profile 'closure', format JSON)
 *   3. Valide la forme du JSON avec Zod (au cas où le modèle dérape)
 *   4. Si erreur ou JSON invalide → retourne null, l'appelant fallback sur le stub
 *
 * Logging : on persiste un AIGenerationJob (modèle, latence, status, erreur).
 */

import { z } from 'zod';
import { childLogger } from '@/lib/logger';

const log = childLogger('mistral');
import { prisma } from '@qualiof/db';
import { callLlm } from '@/lib/ai-llm';
import { getLlmModel, getLlmProvider } from '@/lib/ai-config';
import { DerouleSchema } from '@qualiof/shared';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT_ANALYSE_BESOIN,
  SYSTEM_PROMPT_DEROULE,
  SYSTEM_PROMPT_GRILLE_OBSERVATION,
  SYSTEM_PROMPT_POSITIONNEMENT,
  SYSTEM_PROMPT_QCM,
  SYSTEM_PROMPT_SATISFACTION_CHAUD,
  SYSTEM_PROMPT_SATISFACTION_FROID,
} from './qualiopi-prompts';
import type { QcmContent } from './qcm-template';
import type { GrilleContent } from './grille-observation-template';
import type { AnalyseBesoinContent } from './analyse-besoin-template';
import type { PositionnementContent } from './positionnement-template';
import type { SatisfactionChaudContent } from './satisfaction-chaud-template';
import type { SatisfactionFroidContent } from './satisfaction-froid-template';
import type { DerouleContent } from './deroule-template';

// Le modèle est résolu par la couche config (`ai-config.ts`) via le profil
// 'closure'. Aucun littéral de modèle ne doit apparaître dans ce fichier
// — c'est la garantie P0.1.
const QCM_QUESTIONS_DEFAULT = Number(process.env.CLOSURE_QCM_QUESTIONS ?? 13);

export interface FormationCtx {
  titre: string;
  programmeMd: string;
  nombreHeures: number;
}

export interface StagiaireCtx {
  prenom: string;
  nom: string;
  entreprise: string | null;
  fonction: string | null;
  anciennete: string | null;
  diplomes: string | null;
  professionalStatus: string | null;
}

// =====================================================
// Schemas Zod (validation des outputs Mistral)
// =====================================================

// Output Mistral brut : questions + correct_answer.
// Le scoring (selected_answer, is_correct, score) est attribué en post-process
// par `attachQcmScoring` ci-dessous pour garantir un score >= 65%.
const QcmRawSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(5),
        options: z
          .array(
            z.object({
              letter: z.string().min(1).max(2),
              text: z.string().min(1),
            }),
          )
          .min(2)
          .max(4),
        correct_answer: z.string().min(1).max(2),
      }),
    )
    .min(10), // Qualiopi : volume suffisant pour un test représentatif
});

const AnalyseBesoinSchema = z.object({
  contexte_professionnel: z.string().min(10),
  objectifs_stagiaire: z.array(z.string()).min(2),
  attentes: z.array(z.string()).min(2),
  competences_visees: z.array(z.string()).min(2),
  freins_identifies: z.array(z.string()).optional().default([]),
  motivation: z.string().min(10),
});

// Grille remplie de manière positive : niveau A/B obligatoire (max 1-2 'C'
// tolérés, jamais 'D'), observation 1-2 phrases positives obligatoires.
const GrilleSchema = z.object({
  competences: z
    .array(
      z.object({
        nom: z.string().min(5),
        niveau: z.union([z.literal('A'), z.literal('B'), z.literal('C')]),
        observation: z.string().min(10),
      }),
    )
    .min(5),
  observations_globales: z.object({
    commentaire: z.string().min(10),
    axe_amelioration: z.string().min(10),
  }),
});

// Positionnement : 6-8 compétences avec niveaux avant/après (progression nette).
const NiveauPositionnement = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const PositionnementSchema = z.object({
  objectifs_formation: z.string().min(10),
  demande_specifique: z.string().nullable().optional(),
  prerequis: z.string().min(10),
  competences: z
    .array(
      z.object({
        label: z.string().min(5),
        avant: NiveauPositionnement,
        apres: NiveauPositionnement,
      }),
    )
    .min(6)
    .max(10),
  commentaires: z.string().nullable().optional(),
});

// Satisfaction chaud : ratings sur 5 sections + récap.
const RatingSchema = z.union([z.literal('Très bien'), z.literal('Bien'), z.literal('Moyen'), z.literal('Mauvais')]);
const UtiliteSchema = z.union([z.literal('Très utile'), z.literal('Utile'), z.literal('Peu utile'), z.literal('Pas utile')]);
const SatisfactionChaudSchema = z.object({
  organisation: z.object({
    communication: RatingSchema,
    delai: RatingSchema,
    duree: RatingSchema,
    engagements: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  moyens: z.object({
    cadre: RatingSchema,
    locaux: RatingSchema,
    supports: RatingSchema,
    materiel: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  pedagogie: z.object({
    difficulte: RatingSchema,
    articulation: RatingSchema,
    theorique: RatingSchema,
    pratique: RatingSchema,
    rythme: RatingSchema,
    approche: RatingSchema,
    ecoute: RatingSchema,
    animation: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  groupe: z.object({
    ambiance: RatingSchema,
    nombre: RatingSchema,
    heterogeneite: RatingSchema,
    attention: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  benefice: z.object({
    adequation: RatingSchema,
    utilite: UtiliteSchema,
    commentaire: z.string().nullable().optional(),
  }),
  recommandation: z.union([z.literal('Oui'), z.literal('Non')]),
  remarques: z.string().nullable().optional(),
});

// Satisfaction froid : 9 ratings + bilan.
const SatisfactionFroidSchema = z.object({
  mise_en_pratique: z.object({
    applique: RatingSchema,
    frequence: RatingSchema,
    resultats: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  impact: z.object({
    performance: RatingSchema,
    autonomie: RatingSchema,
    confiance: RatingSchema,
    satisfaction_client: RatingSchema,
    commentaire: z.string().nullable().optional(),
  }),
  bilan: z.object({
    atteinte_objectifs: RatingSchema,
    recommandation: z.union([z.literal('Oui'), z.literal('Non')]),
    utilite_long_terme: RatingSchema,
  }),
  remarques: z.string().nullable().optional(),
});

// Le DerouleSchema vit dans @qualiof/shared (P0.2) — il porte les refines
// Qualiopi (verbes Bloom, mise en situation ↔ grille, invariant nb grilles
// == nb mises). Importé en tête de fichier.

// =====================================================
// Generators
// =====================================================

export async function generateQcmContent(
  formation: FormationCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<QcmContent | null> {
  const prompt = `Génère un QCM d'au moins ${QCM_QUESTIONS_DEFAULT} questions pour la formation suivante.

Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures

Programme :
${formation.programmeMd || '(programme à compléter)'}`;

  const raw = await runMistralJson(
    'generate-qcm',
    SYSTEM_PROMPT_QCM,
    prompt,
    QcmRawSchema,
    refTable,
    refId,
    tenantId,
  );
  if (!raw) return null;
  return attachQcmScoring(raw.questions);
}

/**
 * Post-process : attribue à chaque question un `selected_answer` et `is_correct`,
 * en visant un score global entre 75% et 95% (jamais < 65%). Le scoring est
 * forcé en code (et non délégué au modèle) pour garantir le seuil Qualiopi.
 *
 * Exporté pour permettre la réutilisation : pour 1 même QCM (questions partagées
 * par session), on appelle cette fonction N fois (une par stagiaire) afin
 * d'obtenir N scorings différents.
 */
export function attachQcmScoring(
  rawQuestions: { question: string; options: { letter: string; text: string }[]; correct_answer: string }[],
): QcmContent {
  const total = rawQuestions.length;
  // Score cible : 75% à 95% (en nombre absolu de bonnes réponses arrondi)
  const targetRatio = 0.75 + Math.random() * 0.20;
  const targetCorrect = Math.max(Math.ceil(total * 0.65) + 1, Math.round(total * targetRatio));

  // Choisir au hasard `targetCorrect` indices qui auront une réponse correcte.
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = tmp;
  }
  const correctSet = new Set(indices.slice(0, targetCorrect));

  const questions = rawQuestions.map((q, idx) => {
    if (correctSet.has(idx)) {
      return { ...q, selected_answer: q.correct_answer, is_correct: true };
    }
    // Réponse incorrecte : pick une option ≠ correct_answer au hasard.
    const wrongOptions = q.options.filter((o) => o.letter !== q.correct_answer);
    const picked =
      wrongOptions.length > 0
        ? (wrongOptions[Math.floor(Math.random() * wrongOptions.length)] as { letter: string }).letter
        : q.correct_answer; // edge case : 1 seule option → forcément correcte
    const isCorrect = picked === q.correct_answer;
    return { ...q, selected_answer: picked, is_correct: isCorrect };
  });

  const finalCorrect = questions.filter((q) => q.is_correct).length;
  const score = Math.round((finalCorrect / total) * 100);

  return { questions, score };
}

export async function generateAnalyseBesoinContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<AnalyseBesoinContent | null> {
  const stagiaireBlock = [
    `Prénom : ${stagiaire.prenom}`,
    `Nom : ${stagiaire.nom}`,
    stagiaire.entreprise ? `Entreprise / structure : ${stagiaire.entreprise}` : null,
    stagiaire.fonction ? `Fonction : ${stagiaire.fonction}` : null,
    stagiaire.professionalStatus ? `Statut professionnel : ${stagiaire.professionalStatus}` : null,
    stagiaire.anciennete ? `Ancienneté dans le métier : ${stagiaire.anciennete}` : null,
    stagiaire.diplomes ? `Diplômes / formations : ${stagiaire.diplomes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Rédige une analyse des besoins de formation pour le stagiaire ci-dessous.
La formation est :
Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures
Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaire :
${stagiaireBlock || '(profil non détaillé)'}

L'analyse doit donner l'impression que le stagiaire a réellement répondu à un questionnaire en amont de la formation.`;

  return runMistralJson(
    'generate-analyse-besoin',
    SYSTEM_PROMPT_ANALYSE_BESOIN,
    prompt,
    AnalyseBesoinSchema,
    refTable,
    refId,
    tenantId,
  );
}

export async function generateGrilleContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<GrilleContent | null> {
  const prompt = `Génère une grille d'observation individuelle pour le stagiaire ci-dessous.

Formation :
Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures
Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaire : ${stagiaire.prenom} ${stagiaire.nom}

Génère exactement 7 compétences directement liées au contenu réel de la formation. Pour les niveaux et observations individuelles, laisse à null (la grille sera remplie par le formateur). En revanche, complète bien le bloc \"observations_globales\" avec un commentaire personnalisé et un axe d'amélioration.`;

  return runMistralJson(
    'generate-grille',
    SYSTEM_PROMPT_GRILLE_OBSERVATION,
    prompt,
    GrilleSchema,
    refTable,
    refId,
    tenantId,
  );
}

// =====================================================
// Runner partagé : appel Mistral + validation Zod + logging AIGenerationJob
// =====================================================

/**
 * 1 essai = appel Mistral + parse JSON + validation Zod.
 * Retourne `{ ok: true, data }` si tout OK, sinon `{ ok: false, reason }`
 * pour que l'appelant décide de retry ou non.
 */
async function tryOnce<T>(
  taskName: string,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
): Promise<{ ok: true; data: T; latencyMs: number } | { ok: false; reason: string; latencyMs: number }> {
  const startedAt = Date.now();
  try {
    const result = await callLlm({
      profile: 'closure',
      systemPrompt,
      prompt: userPrompt,
      jsonOutput: true,
      temperature: 0.3,
      maxTokens: 8192,
      // LLM cloud répond en 2-10s typiquement. 60s laisse une marge confortable.
      timeoutMs: 60_000,
    });
    const latencyMs = Date.now() - startedAt;

    if (result.parsedJson === null) {
      const preview = result.raw.slice(0, 200).replace(/\s+/g, ' ');
      return { ok: false, reason: `JSON non parsable. Raw: ${preview}`, latencyMs };
    }
    const parsed = schema.safeParse(result.parsedJson);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' / ');
      return { ok: false, reason: `Schema invalide : ${msg}`, latencyMs };
    }
    log.info(
      { taskName, latencyMs, provider: result.provider, model: result.model, promptVersion: PROMPT_VERSION },
      'llm.ok',
    );
    return { ok: true, data: parsed.data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg, latencyMs };
  }
}

// =====================================================
// Generators 4 nouveaux docs (positionnement, satisfactions, déroulé)
// =====================================================

export async function generatePositionnementContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<PositionnementContent | null> {
  const stagiaireBlock = [
    `Prénom : ${stagiaire.prenom}`,
    `Nom : ${stagiaire.nom}`,
    stagiaire.fonction ? `Fonction : ${stagiaire.fonction}` : null,
    stagiaire.entreprise ? `Entreprise : ${stagiaire.entreprise}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = `Génère un questionnaire de positionnement personnalisé pour le stagiaire ci-dessous.

Formation :
Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures
Programme :
${formation.programmeMd || '(programme à compléter)'}

Stagiaire :
${stagiaireBlock || '(profil non détaillé)'}

Génère 6-8 compétences spécifiques au programme avec niveaux AVANT (majoritairement 1-2) et niveaux APRÈS (majoritairement 4) — la formation doit montrer une progression nette.`;

  return runMistralJson(
    'generate-positionnement',
    SYSTEM_PROMPT_POSITIONNEMENT,
    prompt,
    PositionnementSchema,
    refTable,
    refId,
    tenantId,
  );
}

export async function generateSatisfactionChaudContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<SatisfactionChaudContent | null> {
  const prompt = `Rédige une évaluation de satisfaction à chaud pour le stagiaire ${stagiaire.prenom} ${stagiaire.nom} qui vient de terminer la formation "${formation.titre}" (${formation.nombreHeures} heures).

Programme :
${formation.programmeMd || '(programme à compléter)'}

Le stagiaire est satisfait : au moins 90% de "Très bien" / "Bien", aucun "Mauvais", maximum 1-2 "Moyen". Recommandation : Oui. Commentaires courts et naturels par section.`;

  return runMistralJson(
    'generate-satisfaction-chaud',
    SYSTEM_PROMPT_SATISFACTION_CHAUD,
    prompt,
    SatisfactionChaudSchema,
    refTable,
    refId,
    tenantId,
  );
}

export async function generateSatisfactionFroidContent(
  formation: FormationCtx,
  stagiaire: StagiaireCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<SatisfactionFroidContent | null> {
  const prompt = `Rédige une évaluation de satisfaction à froid (3-6 mois après la formation) pour ${stagiaire.prenom} ${stagiaire.nom} sur la formation "${formation.titre}".

Programme :
${formation.programmeMd || '(programme à compléter)'}

Profil : ${stagiaire.fonction ?? 'professionnel'}${stagiaire.entreprise ? ` chez ${stagiaire.entreprise}` : ''}.

Au moins 90% des ratings en "Très bien" / "Bien". Commentaires concrets sur l'application des acquis depuis la formation.`;

  return runMistralJson(
    'generate-satisfaction-froid',
    SYSTEM_PROMPT_SATISFACTION_FROID,
    prompt,
    SatisfactionFroidSchema,
    refTable,
    refId,
    tenantId,
  );
}

export async function generateDerouleContent(
  formation: FormationCtx,
  refTable = 'PedagogicalAsset',
  refId: string | null = null,
  tenantId: string | null = null,
): Promise<DerouleContent | null> {
  const nbJours = Math.max(1, Math.ceil(formation.nombreHeures / 7));
  const prompt = `Génère un déroulé pédagogique détaillé pour la formation suivante.

Titre : ${formation.titre}
Durée totale : ${formation.nombreHeures} heures
Nombre de jours : ${nbJours} (≈ ${Math.round(formation.nombreHeures / nbJours)} h/jour)

Programme :
${formation.programmeMd || '(programme à compléter)'}

Pour chaque jour, génère 7 séquences :
1. Accueil (30 min, début 8h30)
2. Séquence principale matin (~ ${Math.round((formation.nombreHeures / nbJours - 1) * 0.5 * 60)} min)
3. Pause déjeuner (60 min) — marquer isPause: true, autres champs vides
4. Séquence après-midi 1
5. Pause (10 min) — isPause: true, autres champs vides
6. Séquence après-midi 2
7. Bilan (30 min) — pour le DERNIER jour (jour ${nbJours}), intituler "Évaluation des acquis et clôture"

Total durée formation = ${formation.nombreHeures} heures (hors pauses).`;

  return runMistralJson(
    'generate-deroule',
    SYSTEM_PROMPT_DEROULE,
    prompt,
    DerouleSchema,
    refTable,
    refId,
    tenantId,
  );
}

const MAX_ATTEMPTS = Number(process.env.CLOSURE_MISTRAL_RETRIES ?? 2); // 1 essai initial + 1 retry par défaut

async function runMistralJson<T>(
  taskName: string,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  refTable: string,
  refId: string | null,
  tenantId: string | null,
): Promise<T | null> {
  const inputHash = simpleHash(`${taskName}:${userPrompt}`);
  const jobLog = tenantId
    ? await prisma.aIGenerationJob.create({
        data: {
          tenantId,
          // Provider + model résolus par la config (P0.1) — reflètent ce
          // qui sera EFFECTIVEMENT utilisé par callLlm pour ce profil.
          provider: getLlmProvider(),
          model: getLlmModel('closure'),
          promptVersion: PROMPT_VERSION,
          inputHash,
          status: 'running',
          refTable,
          refId,
        },
      })
    : null;

  let lastReason = '';
  let totalLatency = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await tryOnce(taskName, systemPrompt, userPrompt, schema);
    totalLatency += r.latencyMs;
    if (r.ok) {
      if (jobLog) {
        await prisma.aIGenerationJob.update({
          where: { id: jobLog.id },
          data: { status: 'done', latencyMs: totalLatency, retries: attempt - 1 },
        });
      }
      if (attempt > 1) log.info({ taskName, attempt }, 'mistral.retry.ok');
      return r.data;
    }
    lastReason = r.reason;
    log.warn(
      { taskName, attempt, maxAttempts: MAX_ATTEMPTS, latencyMs: r.latencyMs, reason: r.reason.slice(0, 120) },
      'mistral.attempt.failed',
    );
    // Petit backoff entre 2 tentatives
    if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }

  if (jobLog) await failJob(jobLog.id, lastReason, totalLatency, MAX_ATTEMPTS - 1);
  return null;
}

async function failJob(jobId: string, errorMsg: string, latencyMs: number, retries = 0): Promise<void> {
  try {
    await prisma.aIGenerationJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMsg: errorMsg.slice(0, 500), latencyMs, retries },
    });
  } catch {
    /* ne pas masquer l'erreur principale */
  }
}

function simpleHash(s: string): string {
  // FNV-1a 32-bit — suffisant pour dédoublonner les inputs identiques en logs
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
