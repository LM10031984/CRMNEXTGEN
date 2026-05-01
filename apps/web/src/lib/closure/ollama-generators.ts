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

const QcmSchema = z.object({
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
    .min(3),
});

const AnalyseBesoinSchema = z.object({
  contexte_professionnel: z.string().min(10),
  objectifs_stagiaire: z.array(z.string()).min(2),
  attentes: z.array(z.string()).min(2),
  competences_visees: z.array(z.string()).min(2),
  freins_identifies: z.array(z.string()).optional().default([]),
  motivation: z.string().min(10),
});

const GrilleSchema = z.object({
  competences: z
    .array(
      z.object({
        nom: z.string().min(5),
        niveau: z.union([z.literal('A'), z.literal('B'), z.literal('C'), z.literal('D'), z.null()]).optional().default(null),
        observation: z.string().nullable().optional().default(null),
      }),
    )
    .min(5),
  observations_globales: z
    .object({
      commentaire: z.string().min(10),
      axe_amelioration: z.string().min(10),
    })
    .nullable()
    .optional(),
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
  const prompt = `Génère un QCM de ${QCM_QUESTIONS_DEFAULT} questions pour la formation suivante.

Titre : ${formation.titre}
Durée : ${formation.nombreHeures} heures

Programme :
${formation.programmeMd || '(programme à compléter)'}`;

  return runOllamaJson(
    'generate-qcm',
    SYSTEM_PROMPT_QCM,
    prompt,
    QcmSchema,
    refTable,
    refId,
    tenantId,
  );
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
          inputHash,
          status: 'running',
          refTable,
          refId,
        },
      })
    : null;

  const startedAt = Date.now();
  try {
    const result = await callOllama({
      model: MODEL,
      systemPrompt,
      prompt: userPrompt,
      jsonOutput: true,
      temperature: 0.3,
      maxTokens: 8192,
    });
    const latency = Date.now() - startedAt;

    if (result.parsedJson === null) {
      const preview = result.raw.slice(0, 400).replace(/\s+/g, ' ');
      if (jobLog) await failJob(jobLog.id, `Pas de JSON parsable. Raw[0..400]: ${preview}`, latency);
      console.warn(`[ollama-${taskName}] no JSON parsed in ${latency}ms — raw[0..200]: ${result.raw.slice(0, 200)}`);
      return null;
    }

    const parsed = schema.safeParse(result.parsedJson);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' / ');
      if (jobLog) await failJob(jobLog.id, `Schema invalide : ${msg}`, latency);
      console.warn(`[ollama-${taskName}] schema invalid (${latency}ms): ${msg}`);
      return null;
    }

    if (jobLog) {
      await prisma.aIGenerationJob.update({
        where: { id: jobLog.id },
        data: { status: 'done', latencyMs: latency },
      });
    }
    console.log(`[ollama-${taskName}] ✓ ${latency}ms (model=${MODEL}, prompt=${PROMPT_VERSION})`);
    return parsed.data;
  } catch (err) {
    const latency = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    if (jobLog) await failJob(jobLog.id, msg, latency);
    console.warn(`[ollama-${taskName}] error (${latency}ms): ${msg}`);
    return null;
  }
}

async function failJob(jobId: string, errorMsg: string, latencyMs: number): Promise<void> {
  try {
    await prisma.aIGenerationJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMsg: errorMsg.slice(0, 500), latencyMs },
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
