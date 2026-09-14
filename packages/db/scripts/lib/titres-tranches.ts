/**
 * Les titres de MODULE tranchés par Laurent — appliqués à l'EXTRACTION.
 *
 * ── Pourquoi ici et pas en base ────────────────────────────────────────────
 *
 * Leçon du 11/09/2026, payée une fois : un titre écrit à la main en base
 * REVIENT au premier import du Drive, parce que le titre vient légitimement du
 * document source. On l'a constaté avec un point final réapparu tout seul.
 *
 * La normalisation se fait donc sur le chemin de l'extraction, datée et
 * motivée, comme `RAYONS_TRANCHES` l'a fait pour le doublon rayon ↔ rayon.
 *
 * ── Pourquoi une GARDE sur le titre source ─────────────────────────────────
 *
 * Un arbitrage porte sur un texte précis. Si le document source est réécrit, la
 * décision ne vaut plus : on ne l'applique PAS, et on le dit. Écraser en
 * silence un titre qui a changé, ce serait figer un arbitrage pris sur un autre
 * texte — et personne ne le verrait (§4 ter : on surveille un ÉCART).
 *
 * Clé : `${sourceRef}#${order}` — le module, pas le libellé. Le même libellé
 * peut vivre dans plusieurs programmes ; seuls ceux nommés ici sont touchés.
 */

export interface TitreTranche {
  /** Le titre tel qu'il était au moment de l'arbitrage — la garde. */
  source: string;
  /** Le titre retenu. */
  titre: string;
  motif: string;
  date: string;
}

export const TITRES_TRANCHES: Record<string, TitreTranche> = {
  'drive:008#1': {
    source: 'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
    titre: 'Mener une découverte du projet acheteur-vendeur en situation',
    motif: 'capitales de milieu de phrase',
    date: '14/09/2026',
  },
  'drive:037#2': {
    source: 'Préparer un Excellent Dossier de Suivi Vendeur',
    titre: 'Préparer un dossier de suivi vendeur complet',
    motif: 'capitales de milieu de phrase, et « Excellent » n’est pas évaluable',
    date: '14/09/2026',
  },
  'drive:012#2': {
    source:
      'Pratiquer une découverte acheteur de qualité en questionnant et écoutant activement les besoins des acheteurs :',
    titre: 'Conduire une découverte acheteur par le questionnement et l’écoute active',
    motif: 'deux-points final, et 108 caractères',
    date: '14/09/2026',
  },
  'drive:047#20': {
    source: 'Atelier pratique : Simulation de réponse aux avis clients.',
    titre: 'Répondre aux avis clients en ligne, positifs comme négatifs',
    motif: 'n’est pas un objectif — le moteur refuse de l’inventer et le dit',
    date: '14/09/2026',
  },
};

/** Sans accents ni casse — les intitulés du corpus sont irréguliers. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

export interface ProgrammeTitrable {
  sourceRef: string;
  modules: { order: number; title: string }[];
  warnings: string[];
}

/**
 * Applique les arbitrages, et rend compte de TOUT ce qu'il a fait ou refusé.
 *
 * Trois sorties possibles par entrée de la table, et les trois se disent :
 *   • appliqué        — le titre source correspond, on remplace ;
 *   • NON appliqué    — la source a changé depuis l'arbitrage, à re-trancher ;
 *   • jamais rencontré — la clé ne désigne aucun module de l'instantané.
 *
 * Et le même libellé ailleurs dans le catalogue est SIGNALÉ, jamais touché :
 * l'arbitrage nomme des modules, pas des chaînes de caractères.
 */
export function appliquerTitresTranches(programmes: ProgrammeTitrable[]): string[] {
  const journal: string[] = [];
  const vus = new Set<string>();

  for (const p of programmes) {
    for (const m of p.modules) {
      const cle = `${p.sourceRef}#${m.order}`;
      const a = TITRES_TRANCHES[cle];
      if (!a) continue;
      vus.add(cle);
      if (norm(m.title) !== norm(a.source)) {
        const avis = `⚠ ${cle} — titre tranché le ${a.date} NON appliqué : la source dit désormais « ${m.title} », l’arbitrage portait sur « ${a.source} ». À re-trancher.`;
        p.warnings.push(avis);
        journal.push(avis);
        continue;
      }
      m.title = a.titre;
      const avis = `${cle} — titre tranché par Laurent le ${a.date} : « ${a.source} » → « ${a.titre} » (${a.motif})`;
      p.warnings.push(avis);
      journal.push(avis);
    }
  }

  for (const cle of Object.keys(TITRES_TRANCHES)) {
    if (!vus.has(cle)) {
      journal.push(
        `⚠ ${cle} — arbitrage jamais rencontré : aucun module de l’instantané ne porte cette clé. La table a-t-elle vieilli ?`,
      );
    }
  }

  // Le même libellé ailleurs : on ne le touche pas — l'arbitrage nomme des
  // modules —, mais on refuse de le laisser passer sans le nommer.
  for (const a of Object.values(TITRES_TRANCHES)) {
    for (const p of programmes) {
      for (const m of p.modules) {
        const cle = `${p.sourceRef}#${m.order}`;
        if (TITRES_TRANCHES[cle]) continue;
        if (norm(m.title) === norm(a.source)) {
          journal.push(
            `↷ ${cle} porte le MÊME libellé « ${a.source} » et n’est PAS tranché. À arbitrer séparément.`,
          );
        }
      }
    }
  }

  return journal;
}
