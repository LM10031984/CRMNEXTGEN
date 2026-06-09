/**
 * Templates de déroulement pédagogique par thème — utilisés pour pré-remplir
 * la section "Modalités de déroulement, suivi et sanction" du formulaire
 * AGEFICE (article 6).
 *
 * Format imposé par Laurent (cf retour 05/05/2026) :
 *
 *   Les formateurs proposeront des mises en situations professionnelles
 *   <segment court contextualisé au thème>. Un livret de formation sera remis
 *   à chaque participant en début de formation. Le formateur déroulera sa
 *   formation avec une présentation Canva projetée.
 *
 * Le segment thème change selon la formation (IA, immobilier, management…).
 * Pas de pool aléatoire : 1 segment cohérent par thème → reproduit fidèlement
 * le contenu de la formation dans le doc AGEFICE.
 */

const PEDAGOGY_FIXED_PREFIX =
  'Les formateurs proposeront des mises en situations professionnelles';

const PEDAGOGY_FIXED_SUFFIX =
  'Un livret de formation sera remis à chaque participant en début de formation. ' +
  'Le formateur déroulera sa formation avec une présentation Canva projetée.';

// Phrase héritée du few-shot AI (exemple "immobilier") qui s'est retrouvée
// copiée à tort dans des produits IA / management. On la détecte pour
// l'ignorer et regénérer un segment cohérent avec le thème réel.
const POLLUTING_LEGACY_SEGMENT =
  'techniques de prospection, les discours et la posture';

interface ThemeRule {
  match: (text: string) => boolean;
  segment: string; // commence par une préposition (sur, autour de, appliquées à…) — concaténé après le préfixe fixe
}

const RULES: ThemeRule[] = [
  {
    match: (s) =>
      /\b(ia|chat\s*gpt|chatgpt|intelligence\s*artificielle|copilot|gpt|prompt|llm|agent\s*ia|automat)/i.test(
        s,
      ),
    segment:
      "appliquées aux outils d'intelligence artificielle (ChatGPT, prompts personnalisés, automatisation no-code), avec des cas d'usage concrets adaptés au métier des stagiaires",
  },
  {
    match: (s) => /\b(management|leader|équipe|recrutement|pilotage|coaching|managérial)\b/i.test(s),
    segment:
      "autour du pilotage d'équipe, de la communication managériale et de la conduite du changement, avec des études de cas et des jeux de rôle adaptés au quotidien des managers",
  },
  {
    match: (s) =>
      /\b(prospection|mandat|n[ée]goci|estimation|vente\s*immo|agent\s*commercial)\b/i.test(s),
    segment:
      "sur les techniques de prospection, les discours et la posture commerciale, avec des jeux de rôle et des échanges sur les pratiques actuelles du secteur immobilier",
  },
  {
    match: (s) => /\b(immobilier|agence|conseiller\s*immo)\b/i.test(s),
    segment:
      "appliquées aux situations courantes du métier de conseiller immobilier (prise de mandat, accompagnement client, négociation), avec des échanges sur les pratiques actuelles",
  },
];

const DEFAULT_SEGMENT =
  'adaptées aux pratiques actuelles du secteur, avec des études de cas et des échanges entre participants';

/**
 * Renvoie le segment thème court qui s'insère après "Les formateurs
 * proposeront des mises en situations professionnelles" — sans point final
 * (la fonction parente l'ajoute).
 */
export function pickPedagogyContextSegment(
  theme: string | null | undefined,
  title: string,
): string {
  const haystack = `${theme ?? ''} ${title}`;
  for (const rule of RULES) {
    if (rule.match(haystack)) return rule.segment;
  }
  return DEFAULT_SEGMENT;
}

/**
 * Construit le déroulement pédagogique final pour le formulaire AGEFICE.
 *
 * Stratégie :
 * 1. Si le produit a déjà du contenu pertinent en base (pedagogicalMethods)
 *    et que ce contenu ne contient PAS la phrase polluante du few-shot
 *    historique, on garde ce que Laurent a saisi.
 * 2. Sinon on construit le format propre :
 *    "<préfixe fixe> <segment thème>. <suffixe fixe>"
 *
 * On garantit toujours que la phrase livret/Canva apparaît à la fin.
 */
export function buildDeroulementPedagogique(opts: {
  productMethods: string | null | undefined;
  productSupport: string | null | undefined;
  theme: string | null | undefined;
  title: string;
}): string {
  const productText = [opts.productMethods?.trim(), opts.productSupport?.trim()]
    .filter((s): s is string => Boolean(s))
    .join('\n\n');

  const productTextLower = productText.toLowerCase();
  const isPollutedOrEmpty =
    !productText || productTextLower.includes(POLLUTING_LEGACY_SEGMENT.toLowerCase());

  const main = isPollutedOrEmpty
    ? `${PEDAGOGY_FIXED_PREFIX} ${pickPedagogyContextSegment(opts.theme, opts.title)}.`
    : productText;

  // S'assurer que la phrase livret/Canva apparaît
  const hasCanva = /livret de formation|présentation\s+canva/i.test(main);
  return hasCanva ? main : `${main}\n\n${PEDAGOGY_FIXED_SUFFIX}`;
}

// Export pour compatibilité avec d'anciens imports — équivalent au segment
// "default" si le thème ne match aucune règle.
export const PEDAGOGY_GENERAL = PEDAGOGY_FIXED_SUFFIX;

/** Compat ancienne signature : renvoie le déroulé complet pour un thème. */
export function pickPedagogyTemplate(theme: string | null | undefined, title: string): string {
  return `${PEDAGOGY_FIXED_PREFIX} ${pickPedagogyContextSegment(theme, title)}.`;
}
