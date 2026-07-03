/**
 * Schémas Zod isolés (Phase 16 Plan 16-01), SANS effet de bord.
 *
 * Séparés de `env.ts` parce que `env.ts` exécute `createEnv(...)` au chargement
 * du module (validation de TOUT l'environnement : DATABASE_URL, AUTH_SECRET…).
 * Importer les schémas depuis ce fichier permet de les tester unitairement
 * dans un process vierge (CI, autre machine) sans fournir un `.env` complet.
 *
 * Ce sont les MÊMES schémas que ceux consommés par le bloc `server` de `env.ts`.
 */

import { z } from 'zod';

export const AI_PROVIDER_SCHEMA = z
  .enum(['ollama', 'openrouter', 'anthropic', 'qualiopi-gen'])
  .default('ollama');

export const OPENROUTER_MODEL_FAST_SCHEMA = z.string().default('anthropic/claude-haiku-4.5');
