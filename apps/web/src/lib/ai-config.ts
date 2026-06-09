/**
 * Couche de configuration LLM unique (P0.1).
 *
 * Avant ce module, le routage des appels IA avait des littéraux de modèle
 * dispersés dans plusieurs fichiers (ai-mistral, closure/mistral-generators,
 * preinscription-extractor). Conséquence : impossible de basculer Mistral →
 * Sonnet (ou inverse) sans rechercher / remplacer dans tout le repo.
 *
 * Désormais, TOUT le code passe par `callLlm()` / `callLlmVision()` (cf.
 * `ai-llm.ts`) qui lit son modèle depuis ce module. Le seul levier pour
 * changer le provider ou le modèle = les variables d'env ci-dessous.
 *
 * Provider : OpenRouter (compatibilité OpenAI). Permet de pointer vers
 * Mistral, Anthropic, OpenAI, etc. sans changer le code applicatif.
 */

/** Profils sémantiques utilisés par le code applicatif. */
export type LlmProfile = 'text' | 'vision' | 'classify' | 'closure';

const DEFAULTS: Record<LlmProfile, string> = {
  // Texte structuré (extraction préinscription, ai-fill-product, etc.).
  text: 'mistralai/mistral-large-2411',
  // OCR vision (CNI / RIB photographiés).
  vision: 'mistralai/pixtral-12b',
  // Classification courte (veille réglementaire, scoring rapide).
  // Modèle plus léger : la classification ne demande pas un grand modèle.
  classify: 'mistralai/mistral-small-2402',
  // Génération de documents Qualiopi (closure pack). Profil distinct pour
  // pouvoir tester un modèle plus puissant (Sonnet) sur ce flux critique
  // sans impacter le reste de l'app.
  closure: 'mistralai/mistral-large-2411',
};

const ENV_VAR: Record<LlmProfile, string> = {
  text: 'OPENROUTER_MODEL_TEXT',
  vision: 'OPENROUTER_MODEL_VISION',
  classify: 'OPENROUTER_MODEL_CLASSIFY',
  closure: 'OPENROUTER_MODEL_CLOSURE',
};

/**
 * Renvoie le modèle effectif pour un profil donné.
 * Lit l'env var dédiée, sinon le défaut packagé dans ce module.
 * AUCUN appelant ne doit reconstruire cette logique ailleurs.
 */
export function getLlmModel(profile: LlmProfile): string {
  return process.env[ENV_VAR[profile]] ?? DEFAULTS[profile];
}

/**
 * Provider effectif. OpenRouter pour l'instant. Si on bascule un jour vers
 * un SDK direct (Anthropic, Mistral), c'est ici qu'on sélectionne — pas
 * dans les call sites.
 */
export function getLlmProvider(): 'openrouter' {
  return 'openrouter';
}

/** Endpoint OpenRouter (API compatible OpenAI). */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Récupère la clé API OpenRouter. Throw si manquante — le caller doit
 * gérer l'erreur (jamais de fallback "silent" qui masque le miss-config).
 */
export function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY manquante. Configurer la variable dans .env (https://openrouter.ai/keys).',
    );
  }
  return key;
}

/**
 * Headers communs OpenRouter (attribution + analytics). Le X-Title et
 * HTTP-Referer ne sont pas obligatoires mais OpenRouter les recommande
 * pour le tracking côté facturation.
 */
export function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
    'X-Title': process.env.NEXT_PUBLIC_APP_NAME ?? 'QualiOF',
  };
  const referer = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (referer) headers['HTTP-Referer'] = referer;
  return headers;
}

/**
 * Timeout par défaut (60 s). OpenRouter répond typiquement en 2-15 s, mais
 * un modèle saturé peut bloquer plus longtemps. Aucun worker BullMQ ne doit
 * jamais rester pendu — ce timeout est le filet anti-worker-pendu.
 */
export const DEFAULT_TIMEOUT_MS = 60_000;
