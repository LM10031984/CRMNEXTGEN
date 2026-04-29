/**
 * Templates de déroulement pédagogique par thème — utilisés pour pré-remplir
 * la section "Modalités de déroulement" du formulaire AGEFICE quand le produit
 * n'a pas de description spécifique en base.
 *
 * Logique : choix aléatoire dans le pool correspondant au thème, suivi
 * systématiquement de la phrase générique Start Academy (livret + Canva).
 */

export const PEDAGOGY_GENERAL =
  'Un livret de formation sera remis à chaque participant en début de formation. ' +
  'Le formateur déroulera sa formation avec une présentation Canva projetée.';

const TEMPLATES_IA = [
  "Les formateurs alternent apports théoriques sur l'IA appliquée au métier d'agent immobilier et exercices pratiques avec des outils comme ChatGPT, Midjourney et des assistants no-code.",
  "Le programme combine démonstrations live d'outils IA, mises en situation de prospection assistée et création d'agents personnalisés pour la relation client.",
  "Les apprenants découvrent et expérimentent l'IA générative à travers des cas d'usage concrets : rédaction d'annonces, automatisation de campagnes, qualification de prospects.",
  "Chaque module alterne décryptage des outils IA du marché immobilier, exercices guidés sur prompts personnalisés et création d'assistants IA dédiés aux conseillers.",
];

const TEMPLATES_IMMOBILIER = [
  "Les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.",
  "Le programme alterne apports théoriques, retours d'expérience terrain et études de cas tirés du quotidien des agents commerciaux en immobilier.",
  "Les sessions s'appuient sur des cas pratiques de négociation, prise de mandat, estimation et accompagnement client en agence comme en indépendant.",
  "Le déroulé combine théorie réglementaire, jeux de rôle commerciaux et analyse de scénarios concrets vécus par les apprenants.",
];

const TEMPLATES_MANAGEMENT = [
  "Le programme alterne apports théoriques sur les fondamentaux du management et mises en situation de pilotage d'équipe.",
  "Les formateurs proposeront des cas pratiques de leadership, de communication managériale et de conduite du changement en environnement immobilier.",
  "Les sessions combinent ateliers de réflexion stratégique, échanges entre pairs et exercices d'application directe sur les enjeux du quotidien.",
];

const TEMPLATES_DEFAULT = [
  "Les formateurs proposeront des apports théoriques, des études de cas et des mises en situation professionnelles adaptées aux pratiques actuelles du secteur.",
  "Le programme combine théorie, exercices pratiques et échanges entre participants pour ancrer durablement les acquis.",
  "Les sessions alternent enseignements structurés, ateliers d'application et retours d'expérience entre stagiaires.",
];

interface ThemePool {
  match: (text: string) => boolean;
  pool: readonly string[];
}

const POOLS: ThemePool[] = [
  {
    match: (s) => /\b(ia|chatgpt|intelligence artificielle|copilot|gpt|prompt)\b/.test(s),
    pool: TEMPLATES_IA,
  },
  {
    match: (s) => /\b(management|leader|équipe|recrutement|pilotage|coaching)\b/.test(s),
    pool: TEMPLATES_MANAGEMENT,
  },
  {
    match: (s) => /\b(immobilier|agent|prospection|mandat|vente|n[ée]goci|estimation)\b/.test(s),
    pool: TEMPLATES_IMMOBILIER,
  },
];

export function pickPedagogyTemplate(theme: string | null | undefined, title: string): string {
  const haystack = `${theme ?? ''} ${title}`.toLowerCase();
  const pool =
    POOLS.find((p) => p.match(haystack))?.pool ?? TEMPLATES_DEFAULT;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx]!;
}

/**
 * Construit le déroulement pédagogique final pour le formulaire AGEFICE.
 *
 * Stratégie :
 * - Si le produit a déjà du contenu en base (`pedagogicalMethods` ou
 *   `pedagogicalSupport`), on l'utilise tel quel.
 * - Sinon on tire un template au hasard parmi ceux qui matchent le thème.
 * - Dans tous les cas, on garantit que la phrase générique livret/Canva
 *   apparaît à la fin (append uniquement si pas déjà présente).
 */
export function buildDeroulementPedagogique(opts: {
  productMethods: string | null | undefined;
  productSupport: string | null | undefined;
  theme: string | null | undefined;
  title: string;
}): string {
  const parts = [opts.productMethods?.trim(), opts.productSupport?.trim()]
    .filter((s): s is string => Boolean(s));

  const specific =
    parts.length > 0 ? parts.join('\n\n') : pickPedagogyTemplate(opts.theme, opts.title);

  // S'assurer que la phrase générique est présente
  return specific.toLowerCase().includes('livret')
    ? specific
    : `${specific}\n\n${PEDAGOGY_GENERAL}`;
}
