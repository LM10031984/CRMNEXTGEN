/**
 * Stats d'évaluation calculées À LA VOLÉE (aucun champ stocké, aucune migration —
 * stockage persistant noté pour post-audit). Deux mesures :
 *  - Taux de réussite QCM = % de stagiaires dont le score ≥ seuil, + score moyen.
 *  - Taux de recommandation = % de « Oui » à « Recommanderiez-vous ? » (satisfaction à chaud).
 *
 * Source des scores QCM : PedagogicalAsset(kind='QCM').rawJson.score (POURCENTAGE).
 * On calcule sur le pourcentage stocké, pas sur un « 9/12 » absolu : les QCM en base
 * ont un nombre de questions hétérogène (7/11/12/13) — le % est la seule base fiable.
 * (Vérifié 2026-06-17 : aucun reliquat de l'ancienne version 15 questions.)
 *
 * Au niveau PRODUIT, on n'agrège que les sessions RÉELLES (status='COMPLETED')
 * disposant de scores réels — placeholder/préinscription/sans-QCM exclus.
 */

import { prisma } from '@qualiof/db';
import { computeGlobalScore } from './closure/satisfaction-chaud-template';
import type { SatisfactionChaudContent } from './closure/satisfaction-chaud-template';

/** Seuil de réussite QCM en %. « 9/12 » ≈ 70 % (choix Laurent 17/06 ; 9/12 = 75 % strict). */
export const QCM_SUCCESS_THRESHOLD = 70;

export interface QcmStats {
  /** % de stagiaires dont le score ≥ QCM_SUCCESS_THRESHOLD. */
  tauxReussite: number;
  /** Score moyen (%) sur l'ensemble des stagiaires. */
  scoreMoyen: number;
  nbStagiaires: number;
}

export interface SatisfactionStats {
  /** % de « Oui » à « Recommanderiez-vous cette formation ? » (satisfaction à chaud). */
  tauxRecommandation: number;
  /** Note globale moyenne (%) — « Taux de satisfaction global » (Très bien=100 / Bien=85 / Moyen=50 / Mauvais=0). */
  noteGlobale: number;
  nbReponses: number;
}

export interface EvaluationStats {
  qcm: QcmStats | null;
  satisfaction: SatisfactionStats | null;
  /** Nombre de sessions réelles couvertes par le calcul (pour « X sessions, Y stagiaires »). */
  nbSessions: number;
}

// ---- Helpers purs (testables sans BDD) ----

export function computeQcmStats(scores: number[]): QcmStats | null {
  if (scores.length === 0) return null;
  const reussis = scores.filter((s) => s >= QCM_SUCCESS_THRESHOLD).length;
  const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    tauxReussite: Math.round((reussis / scores.length) * 100),
    scoreMoyen: Math.round(moyenne),
    nbStagiaires: scores.length,
  };
}

/**
 * Stats de satisfaction à chaud : taux de recommandation (% Oui) + note globale
 * moyenne. `recommandeOui` et `notes` proviennent des mêmes docs ; on tolère des
 * longueurs différentes (un doc peut avoir l'un sans l'autre). nbReponses = nb de
 * docs de satisfaction exploités.
 */
export function computeSatisfactionStats(
  recommandeOui: boolean[],
  notes: number[],
): SatisfactionStats | null {
  const nbReponses = Math.max(recommandeOui.length, notes.length);
  if (nbReponses === 0) return null;
  const oui = recommandeOui.filter(Boolean).length;
  const noteGlobale = notes.length > 0 ? Math.round(notes.reduce((a, b) => a + b, 0) / notes.length) : 0;
  return {
    tauxRecommandation: recommandeOui.length > 0 ? Math.round((oui / recommandeOui.length) * 100) : 0,
    noteGlobale,
    nbReponses,
  };
}

/** Extrait le score (%) d'un rawJson QCM, ou null si absent/non numérique. */
export function extractQcmScore(rawJson: unknown): number | null {
  const s = (rawJson as { score?: unknown } | null)?.score;
  return typeof s === 'number' ? s : null;
}

/** Extrait la réponse de recommandation (true=Oui) d'un rawJson satisfaction à chaud. */
export function extractRecommandeOui(rawJson: unknown): boolean | null {
  const r = (rawJson as { recommandation?: unknown } | null)?.recommandation;
  if (r == null) return null;
  return String(r).trim().toLowerCase() === 'oui';
}

/**
 * Extrait la note globale (%) d'un rawJson satisfaction à chaud via la MÊME
 * formule que le doc (computeGlobalScore). Renvoie null si les ratings manquent
 * (rawJson malformé/incomplet) — garde-fou try/catch.
 */
export function extractNoteGlobale(rawJson: unknown): number | null {
  try {
    const content = rawJson as SatisfactionChaudContent;
    if (!content?.organisation || !content?.pedagogie || !content?.benefice) return null;
    return computeGlobalScore(content);
  } catch {
    return null;
  }
}

// ---- Fetch (scopé tenantId) ----

/** Stats d'évaluation pour UNE session (sur ses QCM + satisfactions à chaud réels). */
export async function getSessionEvaluationStats(
  sessionId: string,
  tenantId: string,
): Promise<EvaluationStats> {
  const [qcmAssets, satAssets] = await Promise.all([
    prisma.pedagogicalAsset.findMany({ where: { tenantId, sessionId, kind: 'QCM' }, select: { rawJson: true } }),
    prisma.pedagogicalAsset.findMany({ where: { tenantId, sessionId, kind: 'SATISFACTION_CHAUD' }, select: { rawJson: true } }),
  ]);
  const scores = qcmAssets.map((a) => extractQcmScore(a.rawJson)).filter((s): s is number => s != null);
  const recos = satAssets.map((a) => extractRecommandeOui(a.rawJson)).filter((r): r is boolean => r != null);
  const notes = satAssets.map((a) => extractNoteGlobale(a.rawJson)).filter((n): n is number => n != null);
  return {
    qcm: computeQcmStats(scores),
    satisfaction: computeSatisfactionStats(recos, notes),
    nbSessions: scores.length > 0 || satAssets.length > 0 ? 1 : 0,
  };
}

/**
 * Stats d'évaluation AGRÉGÉES pour un PRODUIT, sur ses sessions RÉELLES
 * (status='COMPLETED') ayant des évaluations réelles. nbSessions = nb de
 * sessions distinctes effectivement couvertes.
 */
export async function getProductEvaluationStats(
  productId: string,
  tenantId: string,
): Promise<EvaluationStats> {
  const [qcmAssets, satAssets] = await Promise.all([
    prisma.pedagogicalAsset.findMany({
      where: { tenantId, kind: 'QCM', session: { productId, status: 'COMPLETED' } },
      select: { rawJson: true, sessionId: true },
    }),
    prisma.pedagogicalAsset.findMany({
      where: { tenantId, kind: 'SATISFACTION_CHAUD', session: { productId, status: 'COMPLETED' } },
      select: { rawJson: true, sessionId: true },
    }),
  ]);
  const qcmScored = qcmAssets.filter((a) => extractQcmScore(a.rawJson) != null);
  const scores = qcmScored.map((a) => extractQcmScore(a.rawJson)!);
  const recos = satAssets.map((a) => extractRecommandeOui(a.rawJson)).filter((r): r is boolean => r != null);
  const notes = satAssets.map((a) => extractNoteGlobale(a.rawJson)).filter((n): n is number => n != null);
  const sessions = new Set<string>([
    ...qcmScored.map((a) => a.sessionId),
    ...satAssets.map((a) => a.sessionId),
  ]);
  return {
    qcm: computeQcmStats(scores),
    satisfaction: computeSatisfactionStats(recos, notes),
    nbSessions: sessions.size,
  };
}
