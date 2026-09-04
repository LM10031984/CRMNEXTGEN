/**
 * Recommandation de programmes (spec §9.1-3, §10) — fonction pure.
 *
 * **La règle produit qui gouverne ce fichier** : un point de douleur MÉTIER
 * reçoit un programme MÉTIER. L'IA n'est jamais la réponse par défaut (retour
 * de Laurent du 01/09 sur la maquette v1). Le moteur refuse donc de servir un
 * programme IA à un besoin métier : quand le catalogue actif n'a rien de
 * métier à proposer, il le DIT (`metierGap`) au lieu de combler le vide avec
 * ce qui traîne.
 *
 * Deux sources de rapprochement, dans cet ordre de confiance :
 *
 *   1. **les signaux du catalogue** (`TrainingModule.diagnosticSignals`) — des
 *      phrases entendues en rendez-vous, attachées au module par l'import du
 *      lot A. C'est la source la plus sûre : elle vient du métier ;
 *   2. **le lexique** ci-dessous — un rapprochement sur l'intitulé et le thème
 *      du produit. Heuristique assumée, jamais silencieuse : chaque candidat
 *      porte son `matchSource`, et l'éditeur l'affiche.
 *
 * Ce que le moteur ne fait JAMAIS :
 *   • proposer un module `excludedFromClientOutputs` (la pige, interdite dans
 *     toute sortie client depuis le 11/08/2026) — ces modules sont retirés
 *     avant même le calcul, signaux compris ;
 *   • proposer un produit inactif — un programme qu'on ne vend pas n'a rien à
 *     faire dans une proposition chiffrée ;
 *   • inventer un programme. Le catalogue est la seule source.
 */

import type { DiagnosticAlert } from '@/lib/diagnostic-r1/ratios';

export type ProgrammeFamily = 'METIER' | 'IA' | 'REGLEMENTAIRE';

/** Un produit du catalogue, vu par le moteur de recommandation. */
export interface CatalogueEntry {
  productId: string;
  code: string;
  title: string;
  theme: string | null;
  isActive: boolean;
  /** Piloté par `TrainingProduct.fundingType`, jamais par un test sur le code. */
  fundingType: 'COEUR_METIER' | 'REGLEMENTAIRE';
  durationHours: number;
  /**
   * Signaux portés par ses modules — l'appelant a DÉJÀ retiré les modules
   * exclus des sorties client.
   */
  signals: string[];
  /** Le produit porte au moins un module exclu : on ne le nomme jamais. */
  hasExcludedModule: boolean;
}

export interface ProgrammeNeed {
  code: string;
  label: string;
  /**
   * Les familles qui peuvent répondre à ce besoin, **par ordre de préférence**.
   *
   * C'est ici que vit la règle produit : les sept besoins de la chaîne
   * commerciale n'acceptent que `METIER`, point — une fuite de mandat ne se
   * répare pas avec un outil. Deux besoins font exception, et pour une raison
   * métier, pas par commodité : l'e-réputation (demander et suivre les avis)
   * et l'équipement de l'équipe sont des sujets d'outillage autant que de
   * méthode. Même là, le métier passe DEVANT : l'IA n'est servie que si aucun
   * programme métier ne couvre le besoin, et le rapport le dit.
   */
  families: readonly ProgrammeFamily[];
  /** Chapitres dont la faiblesse déclenche ce besoin. */
  chapters: number[];
  /** Alertes de ratio qui le déclenchent, quel que soit le score. */
  alertCodes: string[];
  /** Termes cherchés dans les signaux, l'intitulé et le thème du catalogue. */
  keywords: string[];
}

/**
 * Le lexique des besoins.
 *
 * Sept besoins métier avant les deux transverses : l'ordre de cette liste est
 * l'ordre de lecture de la chaîne commerciale (prospecter → rentrer le mandat →
 * commercialiser → transformer), et c'est aussi l'ordre dans lequel les axes
 * apparaissent dans la proposition.
 */
export const PROGRAMME_NEEDS: readonly ProgrammeNeed[] = [
  {
    code: 'prospection',
    label: 'Générer des contacts vendeurs',
    families: ['METIER'],
    chapters: [3],
    alertCodes: ['no_one_prospects', 'contacts_to_rdv_below_benchmark'],
    keywords: ['prospection', 'prospecter', 'secteur', 'incontournable', 'trouver', 'vendeur'],
  },
  {
    code: 'decouverte_vendeur',
    label: 'Formaliser la découverte et l’estimation vendeur',
    families: ['METIER'],
    chapters: [4],
    alertCodes: ['seller_discovery_not_formalized', 'rdv_to_mandat_below_benchmark'],
    keywords: ['vendeur', 'decouverte', 'estimation', 'rendez-vous', 'vente'],
  },
  {
    code: 'mandat_exclusivite',
    label: 'Rentrer des mandats en exclusivité, au bon prix',
    families: ['METIER'],
    chapters: [5],
    alertCodes: ['exclusivity_below_benchmark'],
    keywords: ['mandat', 'exclusivite', 'vente', 'negociation', 'booster'],
  },
  {
    code: 'suivi_vendeur',
    label: 'Piloter le stock et le suivi vendeur',
    families: ['METIER'],
    chapters: [6],
    alertCodes: ['seller_followup_weak'],
    keywords: ['suivi', 'commercialisation', 'vendeur', 'relation client', 'negociation'],
  },
  {
    code: 'acquereurs',
    label: 'Qualifier et sécuriser les acquéreurs',
    families: ['METIER'],
    chapters: [7],
    alertCodes: ['buyer_financing_not_verified'],
    keywords: ['acquereur', 'acheteur', 'financement', 'face a face'],
  },
  {
    code: 'transformation',
    label: 'Transformer visites et offres en actes',
    families: ['METIER'],
    chapters: [8],
    alertCodes: [
      'visits_per_vente_high',
      'offres_to_compromis_below_benchmark',
      'compromis_to_acte_below_benchmark',
    ],
    keywords: ['vente', 'negociation', 'technique', 'closing', 'offre'],
  },
  {
    code: 'ereputation',
    label: 'Faire travailler la base et la réputation',
    families: ['METIER', 'IA'],
    chapters: [9],
    alertCodes: ['reviews_per_vente_below_benchmark'],
    // Volontairement étroits. « marketing », « communication » et « digital »
    // sont du vocabulaire d'entreprise : ils faisaient remonter un programme
    // « pour activité événementielle » à une agence immobilière (constaté sur
    // DIAG-0001). Un mot qui matche tout ne qualifie rien.
    keywords: ['avis', 'reputation', 'visible', 'recommandation', 'presence locale'],
  },
  {
    code: 'outils_ia',
    label: 'Équiper l’équipe et gagner du temps',
    families: ['IA'],
    chapters: [10],
    alertCodes: [],
    keywords: ['intelligence artificielle', 'ia', 'productivite', 'gagner', 'outils'],
  },
  {
    code: 'pilotage',
    label: 'Piloter par les chiffres et animer l’équipe',
    families: ['METIER'],
    chapters: [11],
    alertCodes: ['no_indicators_followed'],
    keywords: ['management', 'pilotage', 'manager', 'performance', 'equipe', 'entretien'],
  },
];

/** En dessous, un chapitre est considéré comme un point de douleur. */
export const WEAK_CHAPTER_SCORE = 60;

/** Sans accents, sans casse — un catalogue saisi à la main est irrégulier. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const IA_PATTERN =
  /\b(ia|i\.a\.|intelligence artificielle|chatgpt|claude|copilot|prompt|generative?)\b/;

/**
 * La famille d'un programme.
 *
 * `REGLEMENTAIRE` vient de la donnée (`fundingType`), jamais d'un test sur le
 * code produit — c'est ce champ qui pilote déjà le taux horaire OPCO EP.
 */
export function familyOf(entry: CatalogueEntry): ProgrammeFamily {
  if (entry.fundingType === 'REGLEMENTAIRE') return 'REGLEMENTAIRE';
  const haystack = normalize(`${entry.title} ${entry.theme ?? ''}`);
  return IA_PATTERN.test(haystack) ? 'IA' : 'METIER';
}

export interface ProgrammeCandidate {
  productId: string;
  code: string;
  title: string;
  family: ProgrammeFamily;
  score: number;
  /** `signaux` l'emporte sur `lexique` : l'un vient du métier, l'autre d'un mot. */
  matchSource: 'signaux' | 'lexique';
  /**
   * Ce que vaut le rapprochement.
   *
   * `forte` = un signal du catalogue, posé par quelqu'un qui connaît le module.
   * `faible` = une correspondance de mots dans un intitulé. Elle peut tomber
   * juste, et elle peut proposer un programme hors sujet : sur DIAG-0001, un
   * programme de communication « pour activité événementielle » remontait sur
   * le besoin e-réputation d'une agence immobilière. On ne la cache pas, on la
   * signale — c'est le commercial qui tranche.
   */
  confidence: 'forte' | 'faible';
  matchedTerms: string[];
  durationHours: number;
}

export interface ProgrammeRecommendation {
  need: ProgrammeNeed;
  /** Ce qui a déclenché le besoin — repris tel quel dans le « pourquoi ». */
  trigger: string;
  candidates: ProgrammeCandidate[];
  /** Aucun programme actif ne répond : on le dit, on ne comble pas. */
  unmet: boolean;
  /** Besoin métier auquel seuls des programmes IA répondraient. */
  metierGap: boolean;
}

export interface ProgrammeMatchInput {
  chapterScores: readonly { chapter: number; score: number | null }[];
  alerts: readonly DiagnosticAlert[];
  catalogue: readonly CatalogueEntry[];
  /** Nombre maximum de candidats rendus par besoin. */
  maxCandidates?: number;
}

export interface ProgrammeMatchOutput {
  recommendations: ProgrammeRecommendation[];
  /** Constats à afficher au commercial — jamais au client. */
  notices: string[];
}

function scoreCandidate(
  entry: CatalogueEntry,
  need: ProgrammeNeed,
): { score: number; source: 'signaux' | 'lexique'; terms: string[] } | null {
  const terms = new Set<string>();
  let signalHits = 0;
  let lexicalHits = 0;

  const signals = entry.signals.map(normalize);
  for (const keyword of need.keywords) {
    const k = normalize(keyword);
    if (signals.some((s) => s.includes(k))) {
      signalHits += 1;
      terms.add(keyword);
    }
  }

  const title = normalize(entry.title);
  const theme = normalize(entry.theme ?? '');
  for (const keyword of need.keywords) {
    const k = normalize(keyword);
    if (title.includes(k)) {
      lexicalHits += 2;
      terms.add(keyword);
    } else if (theme.includes(k)) {
      lexicalHits += 1;
      terms.add(keyword);
    }
  }

  if (signalHits === 0 && lexicalHits === 0) return null;

  return {
    // Un signal du catalogue pèse davantage qu'un mot dans un intitulé : il a
    // été posé par quelqu'un qui connaît le module.
    score: signalHits * 5 + lexicalHits,
    source: signalHits > 0 ? 'signaux' : 'lexique',
    terms: [...terms],
  };
}

export function recommendProgrammes(input: ProgrammeMatchInput): ProgrammeMatchOutput {
  const maxCandidates = input.maxCandidates ?? 3;
  const notices: string[] = [];

  // Un produit inactif ne se vend pas : il n'entre pas dans une proposition.
  const sellable = input.catalogue.filter((e) => e.isActive);
  if (sellable.length === 0) {
    notices.push(
      "Aucun programme actif au catalogue : le moteur ne peut proposer aucun axe. Activez les programmes que vous vendez réellement (rapport d’import du catalogue, 02/09).",
    );
  }

  const scoreByChapter = new Map(input.chapterScores.map((c) => [c.chapter, c.score]));
  const alertsByCode = new Map<string, DiagnosticAlert>();
  for (const a of input.alerts) if (!alertsByCode.has(a.code)) alertsByCode.set(a.code, a);

  const recommendations: ProgrammeRecommendation[] = [];

  for (const need of PROGRAMME_NEEDS) {
    const firedAlert = need.alertCodes.map((c) => alertsByCode.get(c)).find(Boolean);
    const weakChapter = need.chapters.find((ch) => {
      const s = scoreByChapter.get(ch);
      return s !== null && s !== undefined && s < WEAK_CHAPTER_SCORE;
    });

    if (!firedAlert && weakChapter === undefined) continue;

    const trigger =
      firedAlert?.label ??
      `Chapitre ${weakChapter} noté ${scoreByChapter.get(weakChapter!)} / 100 — c'est là que l'effort rapporte le plus vite.`;

    const scored = sellable
      .map((entry) => {
        const s = scoreCandidate(entry, need);
        if (!s) return null;
        const candidate: ProgrammeCandidate = {
          productId: entry.productId,
          code: entry.code,
          title: entry.title,
          family: familyOf(entry),
          score: s.score,
          matchSource: s.source,
          confidence: s.source === 'signaux' ? 'forte' : 'faible',
          matchedTerms: s.terms,
          durationHours: entry.durationHours,
        };
        return candidate;
      })
      .filter((c): c is ProgrammeCandidate => c !== null);

    // On sert dans la PREMIÈRE famille acceptée qui a des candidats. Un besoin
    // métier ne se sert donc jamais avec de l'IA tant qu'il n'a pas déclaré
    // l'accepter — et quand il l'accepte, le métier passe quand même devant.
    const servedFamily = need.families.find((f) => scored.some((c) => c.family === f)) ?? null;
    const inFamily = servedFamily ? scored.filter((c) => c.family === servedFamily) : [];

    // Le manque : un besoin métier auquel SEULS répondent des programmes que le
    // besoin n'accepte pas. On refuse de les servir, et on dit pourquoi.
    const metierGap =
      need.families[0] === 'METIER' && inFamily.length === 0 && scored.length > 0;

    const candidates = inFamily
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
      .slice(0, maxCandidates);

    if (metierGap) {
      notices.push(
        `« ${need.label} » est un besoin métier, et le catalogue actif n’offre que des programmes hors métier pour y répondre (${[
          ...new Set(scored.map((c) => c.code)),
        ]
          .slice(0, 3)
          .join(', ')}). Aucun axe n’est proposé : c’est un manque de catalogue, pas une raison de vendre autre chose.`,
      );
    } else if (
      servedFamily !== null &&
      servedFamily !== need.families[0] &&
      candidates.length > 0
    ) {
      // Servi, mais pas dans la famille préférée : ça se dit, ça ne se subit pas.
      notices.push(
        `« ${need.label} » : aucun programme métier ne le couvre, c’est un programme ${servedFamily === 'IA' ? 'IA' : servedFamily.toLowerCase()} qui est proposé (${candidates[0]!.code}). À confirmer.`,
      );
    } else if (candidates.length === 0) {
      notices.push(
        `Aucun programme actif ne couvre « ${need.label} ». Le besoin est signalé, l’axe reste à composer à la main.`,
      );
    }

    if (candidates.length > 0 && candidates.every((c) => c.confidence === 'faible')) {
      notices.push(
        `« ${need.label} » : le rapprochement avec « ${candidates[0]!.title} » repose sur les mots de son intitulé, pas sur un signal du catalogue. À vérifier avant de l’envoyer.`,
      );
    }

    recommendations.push({
      need,
      trigger,
      candidates,
      unmet: candidates.length === 0,
      metierGap,
    });
  }

  return { recommendations, notices };
}
