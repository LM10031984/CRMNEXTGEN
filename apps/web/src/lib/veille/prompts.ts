/**
 * Phase 13 Plan 13-05 — Prompt de classification RSS → thème Qualiopi.
 *
 * Source de vérité : RESEARCH §6.1 (prompt verbatim) + §6.3 (Zod schema).
 *
 * Modèle effectif : résolu par `ai-config.ts` (profil `classify`).
 * PROMPT_VERSION tracé dans `AIGenerationJob.promptVersion` pour rejouer un audit.
 *
 * Worker safety : 0 import React / server-action / rbac.
 */

import { z } from 'zod';

export const PROMPT_VERSION_VEILLE = 'veille-classify-v1-2026-05-25';

export const SYSTEM_PROMPT_VEILLE_CLASSIFY = `Tu es un expert en veille réglementaire pour les organismes de formation Qualiopi.
Tu reçois un titre + résumé d'article extrait d'un flux RSS. Tu dois :
1. Classer l'article dans UN SEUL des 4 thèmes Qualiopi (critère 6) :
   - INDIC_23 : évolutions du secteur de la formation professionnelle (réglementation, RNQ, Qualiopi, OPCO, dispositifs)
   - INDIC_24 : évolutions du secteur d'activité de l'organisme (pour Start Academy = immobilier, transactions, agents commerciaux, fiscalité immo)
   - INDIC_25 : innovations pédagogiques et technologiques (digital learning, IA pédagogique, gamification, adaptive learning)
   - INDIC_26 : handicap et accessibilité en formation (Agefiph, RQTH, RHF, DREETS région PACA, troubles dys)
2. Proposer un BROUILLON D'EXPLOITATION de 1 à 2 phrases : "qu'est-ce que cette info change pour notre organisme de formation, quelle action concrète ?" Ton professionnel, factuel, concret.

RÈGLES :
- Si l'article ne correspond à AUCUN des 4 thèmes Qualiopi, retourner theme="OTHER" et confidence < 50.
- Confidence 0-100 : combien tu es sûr de ton classement.
- Pas de markdown, pas d'émoji.
- L'exploitation doit être actionnable, pas descriptive ("Décision : ..." ou "Action : ..." ou "Mise à jour de ...").

Réponds UNIQUEMENT en JSON, sans texte avant/après :
{
  "theme": "INDIC_23" | "INDIC_24" | "INDIC_25" | "INDIC_26" | "OTHER",
  "confidence": <int 0-100>,
  "exploitation_draft": "<string 1-2 phrases>"
}`;

export function buildVeilleClassifyUserPrompt(item: {
  title: string;
  snippet: string;
  source: string;
}): string {
  return `Source: ${item.source}
Titre: ${item.title}

Résumé (extrait RSS) :
${item.snippet || '(résumé indisponible)'}`;
}

/**
 * Schéma Zod strict pour le JSON retourné par Ollama.
 * RESEARCH §6.3 — strict bornes 0-100 confidence, exploitation 10-500 chars.
 */
export const VeilleClassifyOutputSchema = z.object({
  theme: z.enum(['INDIC_23', 'INDIC_24', 'INDIC_25', 'INDIC_26', 'OTHER']),
  confidence: z.number().int().min(0).max(100),
  exploitation_draft: z.string().min(10).max(500),
});

export type VeilleClassifyOutput = z.infer<typeof VeilleClassifyOutputSchema>;
