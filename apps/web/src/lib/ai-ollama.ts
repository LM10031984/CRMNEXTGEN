/**
 * Adapter Ollama — déprécié (P0.1).
 *
 * Avant l'unification du routage LLM, des appels Ollama locaux coexistaient
 * avec les appels Mistral cloud. Pour empêcher toute régression — typiquement
 * un test obsolète ou un script d'admin qui ré-importerait l'ancienne API et
 * contournerait silencieusement la facturation OpenRouter / le tracking
 * AIGenerationJob — ce module remplace l'ancien adapter par un shim qui
 * throw au premier appel.
 *
 * Migration : remplacer `callOllama(...)` par
 * `callLlm({ profile: 'text', ... })` depuis `./ai-llm.ts`.
 */

const MIGRATION_MESSAGE =
  '[ai-ollama] L\'adapter Ollama est déprécié depuis P0.1. ' +
  'Utiliser `callLlm({ profile: ... })` depuis `@/lib/ai-llm` (route via OpenRouter). ' +
  'Voir docs/SPRINT-4-ROBUSTESSE-SUITE.md et le commit P0.1.';

/**
 * Bloque tout appel résiduel. Si tu vois cette erreur en runtime, un call
 * site a été oublié — grep `callOllama` ou `from '@/lib/ai-ollama'`.
 */
export function callOllama(): never {
  throw new Error(MIGRATION_MESSAGE);
}

/** Idem pour la vision. */
export function callOllamaVision(): never {
  throw new Error(MIGRATION_MESSAGE);
}
