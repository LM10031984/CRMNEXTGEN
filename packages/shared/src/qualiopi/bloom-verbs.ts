/**
 * Taxonomie de Bloom — verbes d'action mesurables pour objectifs pédagogiques
 * Qualiopi (P0.2).
 *
 * Référentiel Qualiopi indicateur 2 : « Les objectifs pédagogiques sont
 * formulés en termes de capacités opérationnelles, mesurables et
 * observables ». Concrètement : un objectif doit commencer par un verbe
 * d'action mesurable (« identifier », « élaborer »…) et PAS par un verbe
 * vague (« comprendre », « connaître », « être sensibilisé à »).
 *
 * Cette liste sert de filet : les générateurs IA peuvent dériver vers des
 * formulations molles si la régulation côté prompt échoue. Le Zod refine
 * de `deroule-schema.ts` et `programme-schema.ts` consulte cette liste
 * pour rejeter les payloads non conformes AVANT qu'ils n'atteignent un PDF.
 *
 * Source : Bloom (1956) révisée par Anderson & Krathwohl (2001), 6 niveaux
 * cognitifs. Liste enrichie de synonymes pratiques utilisés couramment
 * dans les programmes de formation professionnelle française.
 */

/**
 * Verbes d'action mesurables organisés par niveau cognitif Bloom.
 * Forme infinitive, en minuscules, sans accent (la normalisation se fait
 * dans `hasMeasurableActionVerb`).
 */
export const BLOOM_VERBS_BY_LEVEL = {
  // Niveau 1 : Mémoriser (Remember) — rappel d'informations
  memoriser: [
    'identifier',
    'enumerer',
    'decrire',
    'citer',
    'lister',
    'nommer',
    'definir',
    'reconnaitre',
    'reperer',
    'restituer',
  ],
  // Niveau 2 : Comprendre (Understand) — interprétation
  comprendre: [
    'expliquer',
    'resumer',
    'illustrer',
    'interpreter',
    'paraphraser',
    'classer',
    'distinguer',
    'reformuler',
    'traduire',
  ],
  // Niveau 3 : Appliquer (Apply) — mise en pratique
  appliquer: [
    'appliquer',
    'utiliser',
    'mettre en oeuvre',
    'executer',
    'realiser',
    'demontrer',
    'calculer',
    'employer',
    'deployer',
    'mettre en place',
    'animer',
    'gerer',
    'piloter',
    'conduire',
  ],
  // Niveau 4 : Analyser (Analyze) — décomposition / relations
  analyser: [
    'analyser',
    'comparer',
    'organiser',
    'attribuer',
    'decomposer',
    'structurer',
    'examiner',
    'differencier',
    'diagnostiquer',
    'cartographier',
  ],
  // Niveau 5 : Évaluer (Evaluate) — jugement critique
  evaluer: [
    'evaluer',
    'justifier',
    'critiquer',
    'argumenter',
    'recommander',
    'juger',
    'valider',
    'controler',
    'auditer',
    'mesurer',
  ],
  // Niveau 6 : Créer (Create) — production / synthèse
  creer: [
    'concevoir',
    'produire',
    'elaborer',
    'planifier',
    'construire',
    'formuler',
    'developper',
    'creer',
    'rediger',
    'preparer',
    'proposer',
    'modeliser',
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * Liste plate de tous les verbes Bloom autorisés, déjà normalisés
 * (lowercase, sans accent). Utilisée par la détection regex.
 */
export const BLOOM_ACTION_VERBS: ReadonlySet<string> = new Set(
  Object.values(BLOOM_VERBS_BY_LEVEL).flat(),
);

/**
 * Verbes EXPLICITEMENT non mesurables — formulations à rejeter même si le
 * texte est par ailleurs bien structuré. Ces verbes signalent un objectif
 * cognitif flou ou non observable, ce qui fait tomber l'indicateur Qualiopi 2.
 */
export const VAGUE_VERBS: ReadonlySet<string> = new Set([
  'comprendre',
  'connaitre',
  'savoir',
  'apprendre',
  'sensibiliser',
  'se familiariser',
  'avoir conscience',
  'prendre conscience',
  'etre capable de comprendre',
  'etre informe',
  'decouvrir',
  'aborder',
  'survoler',
]);

/**
 * Normalise une chaîne pour comparaison : minuscules + retire les diacritiques
 * + décompose les ligatures (œ→oe, æ→ae). « Mettre en œuvre » → « mettre en oeuvre ».
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Vérifie qu'un texte (typiquement un objectif pédagogique ou une puce de
 * programme) contient au moins un verbe d'action mesurable Bloom.
 *
 * Heuristique :
 *   - On ignore les puces (`-`, `•`, `*`) et la ponctuation en début de ligne
 *   - On split sur retours-ligne pour traiter chaque puce séparément
 *   - Pour chaque ligne, on prend les ~5 premiers tokens (où vit le verbe)
 *   - On accepte si au moins un token matche un BLOOM_ACTION_VERB
 *
 * Retour :
 *   - `ok: true` si au moins une ligne porte un verbe Bloom
 *   - `ok: false` avec `vagueDetected` si la formulation utilise un verbe vague
 *   - `ok: false` avec `missing: true` si aucun verbe mesurable n'est trouvé
 */
export interface VerbCheckResult {
  ok: boolean;
  vagueDetected?: string;
  missing?: boolean;
  /** Verbe Bloom détecté (utile pour debug / message d'erreur). */
  detected?: string;
}

export function hasMeasurableActionVerb(text: string): VerbCheckResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-•*\d.)]+/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return { ok: false, missing: true };

  // Détecte d'abord un verbe vague — si présent on remonte un message dédié.
  for (const line of lines) {
    const normalized = normalize(line);
    for (const vague of VAGUE_VERBS) {
      // Match au début de ligne uniquement (le verbe vague doit être en tête).
      const re = new RegExp(`^${vague}\\b`);
      if (re.test(normalized)) {
        return { ok: false, vagueDetected: vague };
      }
    }
  }

  // Cherche un verbe Bloom dans les 5 premiers mots de chaque ligne
  // (le verbe d'objectif vit toujours en début de proposition).
  for (const line of lines) {
    const normalized = normalize(line);
    const firstWords = normalized.split(/\s+/).slice(0, 5).join(' ');
    for (const verb of BLOOM_ACTION_VERBS) {
      const re = new RegExp(`\\b${verb}\\b`);
      if (re.test(firstWords)) {
        return { ok: true, detected: verb };
      }
    }
  }

  return { ok: false, missing: true };
}
