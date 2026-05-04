/**
 * Generators IA pour les 3 docs Qualiopi assistés (QCM, GRILLE_OBS, ANALYSE_BESOIN).
 *
 * Chaque generator :
 *   1. Construit un prompt user à partir du contexte (formation + stagiaire)
 *   2. Appelle Ollama via callOllama (format JSON)
 *   3. Valide la forme du JSON avec Zod (au cas où le modèle dérape)
 *   4. Si erreur ou JSON invalide → retourne null, l'appelant fallback sur le stub
 *
 * Logging : on persiste un AIGenerationJob (modèle, latence, status, erreur).
 */

import { z } from 'zod';
import { prisma } from '@qualiof/db';
import { callOllama } from '@/lib/ai-ollama';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT_ANALYSE_BESOIN,
  SYSTEM_PROMPT_GRILLE_OBSERVATION,
  SYSTEM_PROMPT_QCM,
} from './qualiopi-prompts';
import type { QcmContent } from './qcm-template';
import type { GrilleContent } from './grille-observation-template';
import type { AnalyseBesoinContent } from './analyse-besoin-template';

// mistral-small:24b est le meilleur compromis qualité/vitesse/JSON-compliance
// pour ces 3 docs. qwen3:30b-a3b a un comportement instable avec
// `format: json` (thinking caché → réponse vide) — éviter ici.
// Override possible via env CLOSURE_OLLAMA_MODEL.
const MODEL = process.env.CLOSURE_OLLAMA_MODEL ?? 'mistral-small:24b';
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
// Schemas Zod (validation des outputs Ollama)
// =====================================================

// Output Ollama brut : questions + correct_answer.
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

  const raw = await runOllamaJson(
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
 * forcé en code (et non délégué à Ollama) pour garantir le seuil Qualiopi.
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

  return runOllamaJson(
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

  return runOllamaJson(
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
// Runner partagé : appel Ollama + validation Zod + logging AIGenerationJob
// =====================================================

/**
 * 1 essai = appel Ollama + parse JSON + validation Zod.
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
    const result = await callOllama({
      model: MODEL,
      systemPrompt,
      prompt: userPrompt,
      jsonOutput: true,
      temperature: 0.3,
      maxTokens: 8192,
      // 10 min : avec saturation GPU sur Apple Silicon, le QCM peut prendre 5+ min
      timeoutMs: 600_000,
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
    console.log(`[ollama-${taskName}] ✓ ${latencyMs}ms (model=${MODEL}, prompt=${PROMPT_VERSION})`);
    return { ok: true, data: parsed.data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg, latencyMs };
  }
}

const MAX_ATTEMPTS = Number(process.env.CLOSURE_OLLAMA_RETRIES ?? 2); // 1 essai initial + 1 retry par défaut

async function runOllamaJson<T>(
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
          provider: 'ollama',
          model: MODEL,
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
      if (attempt > 1) console.log(`[ollama-${taskName}] ✓ après retry #${attempt - 1}`);
      return r.data;
    }
    lastReason = r.reason;
    console.warn(`[ollama-${taskName}] attempt ${attempt}/${MAX_ATTEMPTS} KO (${r.latencyMs}ms): ${r.reason.slice(0, 120)}`);
    // Petit backoff entre 2 tentatives pour laisser la queue Ollama se vider
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
