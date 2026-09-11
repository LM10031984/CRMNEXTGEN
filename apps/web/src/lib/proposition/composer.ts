/**
 * Le composeur de programme (lot I-2, décisions D-19 et D-20) — fonction pure.
 *
 * Il prend ce que la recommandation a retenu — des MODULES, chacun rattaché à
 * une réponse du diagnostic — et en fait un parcours vendable : une suite de
 * BLOCS de 8 h conventionnées.
 *
 * ## L'unité, et le piège qu'elle porte
 *
 * **Un bloc = une demi-journée = 4 h SUR SITE = 8 h CONVENTIONNÉES.** Les deux
 * nombres décrivent le même bloc et ne se remplacent jamais l'un l'autre :
 *
 *   • ce qui TIENT dans un bloc se mesure en heures **sur site**
 *     (`HALF_DAY_ONSITE_HOURS`) — c'est le temps réel des participants, et
 *     c'est l'assiette du prix ;
 *   • ce que le bloc DÉCLARE au financeur se compte en heures
 *     **conventionnées** (× `TRAINER_COUNT_DEFAULT`) — c'est le nombre qui
 *     s'imprime sur la convention et l'attestation d'assiduité (D-25, D-25 bis).
 *
 * Les confondre double ou divise par deux un dossier. Les deux valeurs sortent
 * donc des mêmes `FundingRule` que le chiffrage, jamais d'une constante d'ici.
 *
 * ## D-20 — le total ne se déduit PAS de la somme des modules
 *
 * On ne vend pas « 7 h 30 de contenu ». On vend N demi-journées, et les durées
 * de modules servent **uniquement** à savoir combien il en tient dans une. Un
 * bloc à moitié rempli reste un bloc entier : c'est une demi-journée de
 * formateurs sur site, elle se facture et se conventionne en entier.
 *
 * ## Le garde-fou qui gouverne tout le fichier
 *
 * **Aucun module n'entre sans justification tracée.** Un module dont le besoin
 * ne cite aucune réponse du diagnostic est REFUSÉ, et le refus se dit. Ce n'est
 * pas une élégance : un contrôle OPCO regarde la cohérence besoin ↔ programme ↔
 * durée, et un parcours dont on ne peut pas expliquer pourquoi chaque module y
 * est ne la passe pas.
 *
 * Corollaire (§8.2) : quand toutes les douleurs sont couvertes et qu'il reste
 * de l'enveloppe, le composeur **s'arrête et l'affiche**. Il ne remplit jamais
 * pour remplir — des droits non consommés se disent au dirigeant, ils ne se
 * dépensent pas à sa place.
 */

import type { FundingRuleValues } from '@/lib/financement/types';

import { conventionedHoursPerHalfDay } from './pricing';
import type {
  DiagnosticEvidence,
  ModuleCandidate,
  ModuleRecommendation,
  ModuleSourceProgramme,
  ProgrammeNeed,
} from './module-matcher';

/** Ce qu'un bloc peut accueillir de contenu, en minutes SUR SITE. */
export function onSiteMinutesPerBlock(rules: FundingRuleValues): number {
  return Math.round(rules.HALF_DAY_ONSITE_HOURS * 60);
}

/** Un module retenu, avec ce qui l'a fait entrer. */
export interface ComposedModule {
  moduleId: string;
  title: string;
  /** Durée SUR SITE. Sert à remplir un bloc, jamais à chiffrer (D-20). */
  durationMin: number;
  source: ModuleSourceProgramme;
  /** Le besoin auquel il répond — jamais vide. */
  need: Pick<ProgrammeNeed, 'code' | 'label'>;
  /** Les réponses du diagnostic qui l'ont fait entrer — jamais vide non plus. */
  evidence: DiagnosticEvidence[];
  matchedSignals: string[];
  confidence: 'forte' | 'faible';
  isFoundation: boolean;
}

export interface ComposedBlock {
  /** 1-based : c'est ce que lit un humain sur la proposition. */
  index: number;
  modules: ComposedModule[];
  /** Ce que les modules occupent réellement. */
  onSiteMinutes: number;
  /** Ce que le bloc peut accueillir. */
  onSiteCapacityMinutes: number;
  /** Ce que le bloc DÉCLARE au financeur — la valeur unique (D-25). */
  conventionedHours: number;
  /** Les besoins servis par ce bloc, dans l'ordre d'apparition. */
  needCodes: string[];
}

export interface ComposeInput {
  /** La sortie de `recommendModules` — des modules déjà justifiés. */
  recommendations: readonly ModuleRecommendation[];
  rules: FundingRuleValues;
  /**
   * L'enveloppe dimensionnée par le moteur budget, en demi-journées. Le
   * composeur ne la dépasse jamais de lui-même : dépasser, c'est vendre du
   * reste à charge que personne n'a arbitré.
   */
  envelopeHalfDays: number;
  /**
   * Combien de modules au maximum par besoin. Deux par défaut : un module
   * couvre un point de douleur, deux le traitent ; au-delà on approfondit un
   * sujet au détriment de ceux qu'on n'a pas encore touchés.
   */
  maxPerNeed?: number;
}

export interface UncoveredNeed {
  code: string;
  label: string;
  reason: 'enveloppe-pleine' | 'aucun-module' | 'sans-justification';
}

export interface ComposeOutput {
  blocks: ComposedBlock[];
  /** Le volume vendu — toujours un entier de demi-journées (D-20). */
  totalHalfDays: number;
  totalOnSiteHours: number;
  /** La valeur unique : proposition, convention, émargement, attestation. */
  totalConventionedHours: number;
  /** Les programmes d'où viennent les modules — D-19 en veut au moins deux. */
  sourceProgrammes: { code: string; title: string }[];
  /**
   * Ce qui reste de l'enveloppe une fois toutes les douleurs couvertes.
   * **Un arbitrage humain, jamais un remplissage** (§8.2).
   */
  spareHalfDays: number;
  uncovered: UncoveredNeed[];
  /** Ce que le composeur a refusé, et pourquoi. */
  rejected: { moduleId: string; title: string; reason: string }[];
  notices: string[];
}

/** Le remplissage occupe-t-il assez le bloc pour qu'on n'ait pas à le dire ? */
const BLOC_CLAIRSEME_SEUIL = 0.6;

/** Deux modules au même intitulé sont un doublon, quels que soient leurs id. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * L'ordre dans lequel les modules se présentent au remplissage.
 *
 * Deux passes, et l'ordre entre elles porte une règle métier : **on couvre
 * toutes les douleurs avant d'en approfondir une seule**. Si l'enveloppe force
 * à couper, elle coupe donc dans la profondeur, jamais dans la largeur — un
 * parcours qui traite six douleurs sur sept vaut mieux qu'un parcours qui en
 * traite trois deux fois.
 */
function orderCandidates(
  recommendations: readonly ModuleRecommendation[],
  maxPerNeed: number,
): { candidate: ModuleCandidate; rec: ModuleRecommendation; rank: number }[] {
  const out: { candidate: ModuleCandidate; rec: ModuleRecommendation; rank: number }[] = [];
  for (let rank = 0; rank < maxPerNeed; rank++) {
    for (const rec of recommendations) {
      const candidate = rec.candidates[rank];
      if (candidate) out.push({ candidate, rec, rank });
    }
  }
  return out;
}

export function composeProgramme(input: ComposeInput): ComposeOutput {
  const { rules } = input;
  const capacity = onSiteMinutesPerBlock(rules);
  const conventionedPerBlock = conventionedHoursPerHalfDay(rules);
  const maxPerNeed = input.maxPerNeed ?? 2;
  const envelope = Math.max(0, Math.floor(input.envelopeHalfDays));

  const notices: string[] = [];
  const rejected: ComposeOutput['rejected'] = [];
  const uncovered: UncoveredNeed[] = [];

  // ── Ce qui n'entrera pas, et pourquoi — dit avant de composer ──────────────
  for (const rec of input.recommendations) {
    if (rec.candidates.length === 0) {
      uncovered.push({ code: rec.need.code, label: rec.need.label, reason: 'aucun-module' });
    } else if (rec.evidence.length === 0) {
      // Le garde-fou. Un besoin déclenché mais que rien ne documente ne peut pas
      // justifier un module devant un contrôle — on refuse plutôt que d'écrire
      // « parce que le chapitre 5 est faible » sur une pièce financeur.
      uncovered.push({
        code: rec.need.code,
        label: rec.need.label,
        reason: 'sans-justification',
      });
      for (const c of rec.candidates) {
        rejected.push({
          moduleId: c.moduleId,
          title: c.title,
          reason: `Aucune réponse du diagnostic ne documente « ${rec.need.label} ».`,
        });
      }
    }
  }

  const servable = input.recommendations.filter(
    (r) => r.candidates.length > 0 && r.evidence.length > 0,
  );

  // ── Le remplissage ─────────────────────────────────────────────────────────
  const blocks: ComposedBlock[] = [];
  const placedNeeds = new Set<string>();
  const debordes: string[] = [];

  /**
   * Ce qui est DÉJÀ dans le parcours — par identifiant ET par intitulé.
   *
   * Les deux, et pas seulement l'identifiant. Constaté sur DIAG-0001 :
   *
   *   • un même module (« Suivi ») porte huit signaux transverses, et il
   *     remontait en tête sur DEUX besoins — la découverte vendeur et le suivi
   *     vendeur. Il se retrouvait donc programmé deux fois. On n'anime pas deux
   *     fois la même séance ;
   *   • deux modules d'identifiants différents portent le MÊME titre
   *     (« Chatbot mandat », rangé sous deux familles du catalogue diagnostic).
   *     Sur le papier ce sont deux modules ; pour le dirigeant qui lit son
   *     programme, c'est une répétition qui décrédibilise tout le reste.
   *
   * Le doublon n'est pas jeté en silence : la place qu'il libère revient au
   * candidat suivant du même besoin.
   */
  const placedModules = new Set<string>();
  const placedTitles = new Set<string>();
  const doublons: string[] = [];

  const newBlock = (): ComposedBlock | null => {
    if (blocks.length >= envelope) return null;
    const block: ComposedBlock = {
      index: blocks.length + 1,
      modules: [],
      onSiteMinutes: 0,
      onSiteCapacityMinutes: capacity,
      conventionedHours: conventionedPerBlock,
      needCodes: [],
    };
    blocks.push(block);
    return block;
  };

  for (const { candidate, rec } of orderCandidates(servable, maxPerNeed)) {
    const titleKey = normalizeTitle(candidate.title);
    if (placedModules.has(candidate.moduleId) || placedTitles.has(titleKey)) {
      doublons.push(candidate.title);
      continue;
    }

    // Un module plus long qu'un bloc entier : il en prend un pour lui, et on le
    // dit. Le rogner serait promettre une séance qu'on n'anime pas.
    const duree = Math.min(candidate.durationMin, capacity);
    if (candidate.durationMin > capacity) debordes.push(candidate.title);

    let block = blocks[blocks.length - 1];
    if (!block || block.onSiteMinutes + duree > capacity) {
      const opened = newBlock();
      if (!opened) {
        // L'enveloppe est pleine. On ne dépasse pas : dépasser, c'est vendre du
        // reste à charge que personne n'a arbitré.
        if (!placedNeeds.has(rec.need.code)) {
          uncovered.push({
            code: rec.need.code,
            label: rec.need.label,
            reason: 'enveloppe-pleine',
          });
        }
        continue;
      }
      block = opened;
    }

    block.modules.push({
      moduleId: candidate.moduleId,
      title: candidate.title,
      durationMin: candidate.durationMin,
      source: candidate.source,
      need: { code: rec.need.code, label: rec.need.label },
      evidence: rec.evidence,
      matchedSignals: candidate.matchedSignals,
      confidence: candidate.confidence,
      isFoundation: candidate.isFoundation,
    });
    block.onSiteMinutes += duree;
    if (!block.needCodes.includes(rec.need.code)) block.needCodes.push(rec.need.code);
    placedNeeds.add(rec.need.code);
    placedModules.add(candidate.moduleId);
    placedTitles.add(titleKey);
  }

  // ── Ce que le parcours dit de lui-même ─────────────────────────────────────
  const sources = new Map<string, string>();
  for (const b of blocks) for (const m of b.modules) sources.set(m.source.code, m.source.title);

  const totalHalfDays = blocks.length;
  const spareHalfDays = Math.max(0, envelope - totalHalfDays);

  if (spareHalfDays > 0 && totalHalfDays > 0) {
    // §8.2 — l'arbitrage humain s'AFFICHE, il ne se décide pas tout seul.
    notices.push(
      `Toutes les douleurs tracées sont couvertes en ${totalHalfDays} demi-journée(s), et vos droits en financeraient ${envelope}. Les ${spareHalfDays} demi-journée(s) restantes ne sont PAS ajoutées d’office : ajouter un module sans point de douleur derrière ne passerait pas un contrôle OPCO. À arbitrer avec le dirigeant — sachant que des droits non consommés au 31 décembre sont perdus.`,
    );
  }

  const enveloppePleine = uncovered.filter((u) => u.reason === 'enveloppe-pleine');
  if (enveloppePleine.length > 0) {
    notices.push(
      `L’enveloppe de ${envelope} demi-journée(s) ne couvre pas tout : ${enveloppePleine
        .map((u) => `« ${u.label} »`)
        .join(', ')} reste(nt) sans module. Le parcours traite les douleurs dans l’ordre de la chaîne commerciale — c’est la profondeur qui a été coupée, pas la largeur.`,
    );
  }

  const sansJustification = uncovered.filter((u) => u.reason === 'sans-justification');
  if (sansJustification.length > 0) {
    notices.push(
      `${sansJustification.length} besoin(s) écarté(s) faute de réponse du diagnostic pour les justifier : ${sansJustification
        .map((u) => `« ${u.label} »`)
        .join(', ')}. Un module qu’on ne sait pas expliquer n’entre pas dans une proposition.`,
    );
  }

  if (doublons.length > 0) {
    notices.push(
      `${doublons.length} module(s) écarté(s) parce qu'ils figuraient déjà au parcours (${[
        ...new Set(doublons),
      ]
        .slice(0, 3)
        .join(', ')}). Un module transverse remonte sur plusieurs besoins — il n'est programmé qu'une fois, et la place revient au candidat suivant.`,
    );
  }

  if (debordes.length > 0) {
    notices.push(
      `${debordes.length} module(s) dépassent une demi-journée sur site et en occupent une entière : ${debordes
        .slice(0, 3)
        .join(', ')}. À vérifier au moment de bâtir le déroulé.`,
    );
  }

  const clairsemes = blocks.filter((b) => b.onSiteMinutes < capacity * BLOC_CLAIRSEME_SEUIL);
  if (clairsemes.length > 0) {
    notices.push(
      `${clairsemes.length} demi-journée(s) sont remplies à moins de ${Math.round(BLOC_CLAIRSEME_SEUIL * 100)} %. Ce n’est pas une erreur de calcul — une demi-journée se vend et se conventionne entière (D-20) — mais c’est le signe qu’il y a de la place pour un module de plus, si une douleur le justifie.`,
    );
  }

  if (sources.size === 1 && totalHalfDays > 0) {
    notices.push(
      `Tous les modules viennent du même programme (${[...sources.keys()][0]}). Ce n’est pas interdit, mais c’est l’inverse de ce que la bibliothèque permet : vérifiez qu’aucun autre programme ne couvrirait mieux une des douleurs.`,
    );
  }

  return {
    blocks,
    totalHalfDays,
    totalOnSiteHours: Math.round((totalHalfDays * rules.HALF_DAY_ONSITE_HOURS * 100)) / 100,
    totalConventionedHours: totalHalfDays * conventionedPerBlock,
    sourceProgrammes: [...sources.entries()].map(([code, title]) => ({ code, title })),
    spareHalfDays,
    uncovered,
    rejected,
    notices,
  };
}

/**
 * Le chemin inverse : reconstruire une composition depuis les axes ENREGISTRÉS.
 *
 * Pourquoi il existe. Le composeur propose ; le commercial dispose. Il retire
 * un module, en ajoute un, change une durée — et c'est sa proposition, pas la
 * suggestion initiale, que le client signe. Le produit composé et son programme
 * Qualiopi doivent donc être fabriqués depuis **ce que la proposition vend
 * réellement**, jamais depuis un recalcul qui écraserait la main humaine.
 *
 * C'est aussi ce qui rend le produit reproductible : régénéré six mois plus
 * tard depuis la même proposition, il redonne le même programme, même si le
 * catalogue a bougé entre-temps.
 */
export function compositionFromAxes(
  axes: readonly {
    halfDays: number;
    modules: readonly {
      moduleId: string;
      title: string;
      sourceCode: string;
      sourceTitle: string;
      needLabel: string;
      durationMin: number;
      quotes: readonly string[];
      signal: string | null;
      confidence: 'forte' | 'faible';
    }[];
  }[],
  rules: FundingRuleValues,
): ComposeOutput {
  const capacity = onSiteMinutesPerBlock(rules);
  const conventionedPerBlock = conventionedHoursPerHalfDay(rules);

  const blocks: ComposedBlock[] = axes.map((axe, i) => {
    const modules: ComposedModule[] = axe.modules.map((m) => ({
      moduleId: m.moduleId,
      title: m.title,
      durationMin: m.durationMin,
      source: {
        productId: '',
        code: m.sourceCode,
        title: m.sourceTitle,
        theme: null,
        fundingType: 'COEUR_METIER',
        isActive: false,
        supersededBy: null,
      },
      need: { code: m.needLabel, label: m.needLabel },
      // Les citations enregistrées, relues comme des preuves de réponse : le
      // détail de l'alerte d'origine n'a pas à être retraversé, c'est le TEXTE
      // qui a été montré au dirigeant qui fait foi.
      evidence: m.quotes.map((q) => ({
        kind: 'reponse' as const,
        questionId: '',
        label: q,
        value: '',
        rule: '',
        note: '',
        earned: 0,
      })),
      matchedSignals: m.signal ? [m.signal] : [],
      confidence: m.confidence,
      isFoundation: false,
    }));

    return {
      index: i + 1,
      modules,
      onSiteMinutes: modules.reduce((s, m) => s + m.durationMin, 0),
      onSiteCapacityMinutes: capacity,
      conventionedHours: conventionedPerBlock,
      needCodes: [...new Set(modules.map((m) => m.need.code))],
    };
  });

  const sources = new Map<string, string>();
  for (const b of blocks) for (const m of b.modules) sources.set(m.source.code, m.source.title);

  // Le volume vendu vient des `halfDays` des axes, pas du nombre de blocs : un
  // commercial peut avoir mis 2 demi-journées sur un axe. D-20 tient quand même
  // — le total reste un entier de demi-journées, donc un multiple du bloc.
  const totalHalfDays = axes.reduce((s, a) => s + a.halfDays, 0);

  return {
    blocks,
    totalHalfDays,
    totalOnSiteHours: Math.round(totalHalfDays * rules.HALF_DAY_ONSITE_HOURS * 100) / 100,
    totalConventionedHours: totalHalfDays * conventionedPerBlock,
    sourceProgrammes: [...sources.entries()].map(([code, title]) => ({ code, title })),
    spareHalfDays: 0,
    uncovered: [],
    rejected: [],
    notices: [],
  };
}
