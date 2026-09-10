/**
 * Recommandation au niveau MODULE (lot I-1, décision D-19) — fonction pure.
 *
 * Le renversement que ce fichier applique : **un programme ne se vend pas tel
 * quel, il se compose**. L'unité recommandable n'est donc plus le produit du
 * catalogue mais le MODULE, et un même axe de proposition peut réunir des
 * modules venus de programmes sources différents.
 *
 * Trois règles gouvernent ce fichier, et aucune ne se renégocie :
 *
 *  1. **`isActive` du conteneur n'est PAS un critère** (corollaire D-19 du
 *     10/09/2026). Les conteneurs importés — catalogue diagnostic, Drive
 *     « Formations et programmes », Faros — ne sont jamais activés : ce sont
 *     des rayons de bibliothèque, pas des offres. Filtrer dessus viderait la
 *     bibliothèque de tout ce qui vient d'être importé et ferait retomber la
 *     reco sur les seuls produits historiques, qui ne portent aucun module.
 *     C'est le **produit composé** (lot I-2) qui portera l'état vendable.
 *     `TrainingProduct.isActive` garde par ailleurs son sens habituel sur le
 *     catalogue commercial et les pages publiques : deux lectures du même
 *     champ, distinguées ici explicitement plutôt que devinées.
 *
 *  2. **Une douleur métier reçoit un module métier** (règle gravée n°7).
 *     L'IA n'est jamais la réponse par défaut : un besoin déclare les familles
 *     qu'il accepte, par ordre de préférence (D-18), et servir une autre
 *     famille se DIT dans les notices.
 *
 *  3. **Chaque module retenu est traçable jusqu'à une réponse du diagnostic.**
 *     C'est ce que regarde un contrôle OPCO — la cohérence besoin ↔ programme ↔
 *     durée — et c'est ce qui interdit de remplir un parcours pour consommer
 *     une enveloppe. Un module sans justification n'a rien à faire dans une
 *     proposition.
 *
 * Ce que le moteur ne fait JAMAIS : proposer un module
 * `excludedFromClientOutputs` (la pige, interdite dans toute sortie client
 * depuis le 11/08/2026), ni inventer un module. La bibliothèque est la seule
 * source.
 */

import type { DiagnosticAlert } from '@/lib/diagnostic-r1/ratios';
import {
  IA_PATTERN,
  PROGRAMME_NEEDS,
  WEAK_CHAPTER_SCORE,
  normalize,
  type ProgrammeFamily,
  type ProgrammeNeed,
} from './programme-matcher';

export { PROGRAMME_NEEDS, WEAK_CHAPTER_SCORE };
export type { ProgrammeFamily, ProgrammeNeed };

/** Le programme d'origine d'un module — son « rayon » dans la bibliothèque. */
export interface ModuleSourceProgramme {
  productId: string;
  code: string;
  title: string;
  theme: string | null;
  /** Piloté par `TrainingProduct.fundingType`, jamais par un test sur le code. */
  fundingType: 'COEUR_METIER' | 'REGLEMENTAIRE';
  /**
   * LU, mais jamais filtré (règle 1 ci-dessus). Présent pour que l'écran
   * puisse dire « ce module vient d'un rayon non vendu tel quel », pas pour
   * écarter le module.
   */
  isActive: boolean;
}

/** Un module de la bibliothèque, vu par le moteur de recommandation. */
export interface LibraryModule {
  moduleId: string;
  title: string;
  /** Famille du catalogue Start Academy (« Acquisition », « Management »…). */
  family: string | null;
  targetProfile: string | null;
  /** Phrases entendues en rendez-vous qui déclenchent ce module. */
  signals: string[];
  /** Les questions à poser pour vérifier que le besoin est réel. */
  needIdentification: string | null;
  isFoundation: boolean;
  durationMin: number;
  /** La pige : écartée par le moteur lui-même, pas seulement par l'appelant. */
  excludedFromClientOutputs: boolean;
  source: ModuleSourceProgramme;
}

/** Une réponse du diagnostic, telle qu'elle est restituée dans l'audit. */
export interface EvidenceAnswer {
  questionId: string;
  label: string;
  value: string;
}

/**
 * Ce qui a fait entrer un besoin — et donc les modules qui le servent.
 *
 * Deux natures, jamais mélangées : une ALERTE de ratio (« l'exclusivité
 * représente 22 % de vos rentrées contre 40 % attendus ») porte les réponses
 * chiffrées qui l'ont produite ; une RÉPONSE mal notée porte la question, les
 * mots du client et la règle du barème qui l'a sanctionnée.
 */
export type DiagnosticEvidence =
  | {
      kind: 'alerte';
      code: string;
      label: string;
      chapter: number | null;
      answers: EvidenceAnswer[];
    }
  | {
      kind: 'reponse';
      questionId: string;
      label: string;
      value: string;
      /** L'identifiant de la règle du barème (`scoring.ts`). */
      rule: string;
      note: string;
      /** Ce que la règle a accordé, sur 100. */
      earned: number;
    };

export interface ModuleCandidate {
  moduleId: string;
  title: string;
  family: ProgrammeFamily;
  source: ModuleSourceProgramme;
  score: number;
  /** `signaux` l'emporte sur `lexique` : l'un vient du métier, l'autre d'un mot. */
  matchSource: 'signaux' | 'lexique';
  confidence: 'forte' | 'faible';
  /** Le ou les signaux du catalogue qui ont matché — la traçabilité module ↔ signal. */
  matchedSignals: string[];
  matchedTerms: string[];
  isFoundation: boolean;
  durationMin: number;
}

export interface ModuleRecommendation {
  need: ProgrammeNeed;
  /** La phrase affichée en tête d'axe — reprise telle quelle dans le « pourquoi ». */
  trigger: string;
  /** Les réponses du diagnostic qui ont déclenché ce besoin. */
  evidence: DiagnosticEvidence[];
  candidates: ModuleCandidate[];
  /** Aucun module de la bibliothèque ne répond : on le dit, on ne comble pas. */
  unmet: boolean;
  /** Besoin métier auquel seuls des modules hors métier répondraient. */
  metierGap: boolean;
}

/** Un score de chapitre, avec le détail qui permet de remonter aux réponses. */
export interface ChapterScoreLike {
  chapter: number;
  score: number | null;
  breakdown?: readonly {
    rule: string;
    weight: number;
    earned: number | null;
    note: string;
    questionId: string | null;
    ratioKey: string | null;
  }[];
}

export interface ModuleMatchInput {
  chapterScores: readonly ChapterScoreLike[];
  alerts: readonly DiagnosticAlert[];
  /** Les réponses restituées dans l'audit, pour citer le client mot pour mot. */
  answers: readonly EvidenceAnswer[];
  library: readonly LibraryModule[];
  /** Nombre maximum de modules rendus par besoin. */
  maxCandidates?: number;
}

export interface ModuleMatchOutput {
  recommendations: ModuleRecommendation[];
  /** Constats à afficher au commercial — jamais au client. */
  notices: string[];
  /** De combien de programmes sources distincts viennent les modules retenus. */
  sourceProgrammeCount: number;
  /** Combien de modules la bibliothèque a offerts au calcul, pige déduite. */
  libraryModuleCount: number;
}

/**
 * Le vocabulaire qui trahit un contenu MÉTIER.
 *
 * Il n'est pas saisi à la main : c'est exactement celui des besoins de la
 * chaîne commerciale qui n'acceptent que du métier (D-18). Une seconde liste
 * finirait par diverger de la première, et la règle gravée n°7 reposerait alors
 * sur deux définitions du mot « métier ».
 */
const METIER_VOCABULARY: readonly string[] = [
  ...new Set(
    PROGRAMME_NEEDS.filter((n) => n.families[0] === 'METIER').flatMap((n) =>
      n.keywords.map((k) => normalize(k)),
    ),
  ),
];

/**
 * La famille d'un module, pour la règle « douleur métier → module métier ».
 *
 * L'ordre de lecture n'est pas indifférent :
 *
 *   1. le **financement** tranche d'abord — `REGLEMENTAIRE` vient de la donnée
 *      (`fundingType`), jamais d'un test sur le code produit ;
 *   2. le **module parle pour lui-même** ensuite, et dans les DEUX sens : son
 *      titre porte du vocabulaire d'IA, ou il porte du vocabulaire métier.
 *      C'est tout l'intérêt de descendre au module — « Prospecter autrement sur
 *      son secteur » reste un module métier même rangé dans un rayon d'IA, et
 *      c'est précisément le cas que D-19 vient régler. Sans cette lecture
 *      positive du métier, « métier » ne voudrait dire que « absence d'IA » et
 *      l'héritage du rayon écraserait toujours le module ;
 *   3. à défaut seulement, **son rayon parle pour lui** — un module au titre
 *      muet (« Atelier pratique ») rangé dans un programme d'IA en est un.
 */
export function moduleFamilyOf(m: LibraryModule): ProgrammeFamily {
  if (m.source.fundingType === 'REGLEMENTAIRE') return 'REGLEMENTAIRE';

  const own = normalize(`${m.title} ${m.family ?? ''}`);
  if (IA_PATTERN.test(own)) return 'IA';
  if (METIER_VOCABULARY.some((word) => own.includes(word))) return 'METIER';

  if (IA_PATTERN.test(normalize(`${m.source.title} ${m.source.theme ?? ''}`))) return 'IA';
  return 'METIER';
}

/**
 * Le rapprochement d'un module avec un besoin.
 *
 * Ce qu'on lit, et pourquoi seulement ça :
 *   • les **signaux** du catalogue — la source sûre, posée par quelqu'un qui
 *     connaît le module ;
 *   • le **titre** du module et sa **famille** de catalogue ;
 *   • les **questions d'identification du besoin** (`needIdentification`) —
 *     littéralement « ce qu'il faut demander pour vérifier que le besoin est
 *     réel ». C'est du vocabulaire de diagnostic, donc très qualifiant.
 *
 * Ce qu'on ne lit PAS : le contenu détaillé du module. C'est la leçon D-18
 * appliquée d'un cran plus bas — dans un déroulé pédagogique, « vente »,
 * « client » et « suivi » apparaissent partout. Un mot qui matche tout ne
 * qualifie rien, et l'ajouter ferait remonter n'importe quel module sur
 * n'importe quel besoin avec une confiance imméritée.
 */
/** Tout ce dans quoi un mot-clé se cherche, pour un module donné. */
function haystack(m: LibraryModule): string {
  return normalize(
    [m.title, m.family ?? '', m.needIdentification ?? '', ...m.signals].join(' '),
  );
}

/**
 * Le pouvoir DISCRIMINANT de chaque mot-clé, mesuré sur la bibliothèque réelle.
 *
 * C'est la leçon D-18 poussée d'un cran, et rendue automatique. Laurent avait
 * tranché à la main : « marketing », « communication » et « digital » matchent
 * tout, donc ne qualifient rien, et on les a retirés. Le même mal reparaît au
 * niveau module, mais sur des mots qu'on ne peut PAS retirer — « vendeur » est
 * indispensable au besoin « découverte vendeur », et il apparaît pourtant dans
 * un module sur cinq. Sans correctif, un module « Suivi vendeur » remontait en
 * confiance FORTE sur un besoin de découverte, parce que son signal contenait
 * le mot « vendeurs ».
 *
 * On ne retire donc plus les mots : on les PÈSE. Un mot qui touche la moitié de
 * la bibliothèque ne vaut rien ; un mot qui n'en touche que 2 % vaut plein
 * tarif. La mesure se refait à chaque appel, sur la bibliothèque du moment :
 * une liste figée redeviendrait fausse au premier import.
 *
 * Elle ne se fait PAS sur une poignée de modules. Sur dix modules, un mot
 * présent deux fois pèse 20 % — la statistique dirait « passe-partout » là où
 * il n'y a qu'un petit échantillon. En dessous du seuil, tous les mots valent
 * donc plein tarif : mieux vaut ne pas pondérer que pondérer au hasard.
 */
function discriminationWeights(
  library: readonly LibraryModule[],
  needs: readonly ProgrammeNeed[],
): Map<string, number> {
  const weights = new Map<string, number>();
  const total = library.length;
  if (total < MIN_LIBRARY_FOR_WEIGHTING) return weights; // non mesurable : plein tarif

  const texts = library.map(haystack);
  for (const need of needs) {
    for (const keyword of need.keywords) {
      const k = normalize(keyword);
      if (weights.has(k)) continue;
      const share = texts.filter((t) => t.includes(k)).length / total;
      weights.set(k, share <= 0.05 ? 1 : share <= 0.15 ? 0.6 : share <= 0.35 ? 0.3 : 0);
    }
  }
  return weights;
}

/**
 * En dessous de cette taille, la fréquence d'un mot dans la bibliothèque n'est
 * pas une mesure : c'est du bruit d'échantillonnage. On ne pondère pas.
 */
const MIN_LIBRARY_FOR_WEIGHTING = 30;

/** Au-dessous, un rapprochement ne repose que sur des mots passe-partout. */
const QUALIFYING_WEIGHT = 1;

function scoreModule(
  m: LibraryModule,
  need: ProgrammeNeed,
  weights: ReadonlyMap<string, number>,
): { score: number; source: 'signaux' | 'lexique'; confidence: 'forte' | 'faible'; terms: string[]; signals: string[] } | null {
  const terms = new Set<string>();
  const matchedSignals = new Set<string>();
  let signalWeight = 0;
  let lexicalWeight = 0;

  const signals = m.signals.map((s) => ({ raw: s, norm: normalize(s) }));
  const title = normalize(m.title);
  const family = normalize(m.family ?? '');
  const needId = normalize(m.needIdentification ?? '');

  for (const keyword of need.keywords) {
    const k = normalize(keyword);
    const w = weights.get(k) ?? 1;
    if (w === 0) continue; // mot passe-partout : il ne qualifie rien (D-18)

    const hit = signals.filter((s) => s.norm.includes(k));
    if (hit.length > 0) {
      signalWeight += w;
      terms.add(keyword);
      for (const h of hit) matchedSignals.add(h.raw);
    }
    if (title.includes(k)) {
      lexicalWeight += 2 * w;
      terms.add(keyword);
    } else if (needId.includes(k)) {
      lexicalWeight += 2 * w;
      terms.add(keyword);
    } else if (family.includes(k)) {
      lexicalWeight += w;
      terms.add(keyword);
    }
  }

  if (signalWeight === 0 && lexicalWeight === 0) return null;

  return {
    // Un signal du catalogue pèse davantage qu'un mot dans un intitulé, et un
    // module socle passe devant un module avancé à égalité de rapprochement
    // (`isFoundation` — on n'apprend pas l'avancé avant la base).
    score: Math.round((signalWeight * 5 + lexicalWeight + (m.isFoundation ? 1 : 0)) * 10) / 10,
    source: signalWeight > 0 ? 'signaux' : 'lexique',
    // « forte » se mérite : il faut qu'un mot RÉELLEMENT discriminant ait touché
    // un signal. Un signal accroché par le seul mot « vendeur » reste faible —
    // c'est une piste, pas une preuve, et l'éditeur doit le dire.
    confidence: signalWeight >= QUALIFYING_WEIGHT ? 'forte' : 'faible',
    terms: [...terms],
    signals: [...matchedSignals],
  };
}

/** Les réponses derrière une alerte, dans l'ordre où l'alerte les nomme. */
function answersFor(
  questionIds: readonly string[],
  byQuestion: ReadonlyMap<string, EvidenceAnswer>,
): EvidenceAnswer[] {
  return questionIds.map((id) => byQuestion.get(id)).filter((a): a is EvidenceAnswer => !!a);
}

/** Combien de règles mal notées on cite pour un chapitre faible. */
const MAX_EVIDENCE_PER_NEED = 3;

/**
 * Combien de modules un même programme source peut occuper dans un axe.
 *
 * Sans plafond, un axe se remplit du seul programme le plus « généraliste ».
 * Constaté sur DIAG-0001 : un module du catalogue diagnostic porte huit signaux
 * couvrant la moitié de la chaîne commerciale, si bien que son rayon raflait
 * les cinq places de presque chaque axe. Ce n'est pas un défaut de données —
 * ce module est réellement transverse — mais c'est l'inverse de ce que D-19
 * demande : **composer depuis plusieurs programmes**, pas revendre le rayon qui
 * parle le plus fort.
 *
 * Deux places par rayon laissent la place à trois programmes sources dans un
 * axe de cinq modules. Le plafond ne masque rien : ce qu'il écarte est du même
 * rayon que ce qu'il garde, donc visible en un clic dans le composeur (I-2).
 */
const MAX_PER_SOURCE = 2;

export function recommendModules(input: ModuleMatchInput): ModuleMatchOutput {
  const maxCandidates = input.maxCandidates ?? 5;
  const notices: string[] = [];
  const byQuestion = new Map(input.answers.map((a) => [a.questionId, a]));

  // ── La bibliothèque ────────────────────────────────────────────────────────
  // Aucun filtre sur `source.isActive` : c'est la règle 1, et le test
  // « tous les conteneurs inactifs » la tient. Le seul retrait est la pige.
  const excluded = input.library.filter((m) => m.excludedFromClientOutputs);
  const library = input.library.filter((m) => !m.excludedFromClientOutputs);

  if (library.length === 0) {
    notices.push(
      "La bibliothèque de modules est vide : aucun axe ne peut être proposé. Vérifiez que l'import du catalogue a bien été appliqué sur cette base.",
    );
  }

  const scoreByChapter = new Map(input.chapterScores.map((c) => [c.chapter, c.score]));
  const breakdownByChapter = new Map(
    input.chapterScores.map((c) => [c.chapter, c.breakdown ?? []]),
  );
  const alertsByCode = new Map<string, DiagnosticAlert>();
  for (const a of input.alerts) if (!alertsByCode.has(a.code)) alertsByCode.set(a.code, a);

  const weights = discriminationWeights(library, PROGRAMME_NEEDS);
  const recommendations: ModuleRecommendation[] = [];
  const sourcesRetained = new Set<string>();

  for (const need of PROGRAMME_NEEDS) {
    const firedAlerts = need.alertCodes
      .map((c) => alertsByCode.get(c))
      .filter((a): a is DiagnosticAlert => !!a);
    const weakChapter = need.chapters.find((ch) => {
      const s = scoreByChapter.get(ch);
      return s !== null && s !== undefined && s < WEAK_CHAPTER_SCORE;
    });

    if (firedAlerts.length === 0 && weakChapter === undefined) continue;

    const trigger =
      firedAlerts[0]?.label ??
      `Chapitre ${weakChapter} noté ${scoreByChapter.get(weakChapter!)} / 100 — c'est là que l'effort rapporte le plus vite.`;

    // ── Les preuves : ce que le client a répondu ─────────────────────────────
    const evidence: DiagnosticEvidence[] = firedAlerts.map((a) => ({
      kind: 'alerte' as const,
      code: a.code,
      label: a.label,
      chapter: a.chapter,
      answers: answersFor(a.questionIds, byQuestion),
    }));

    for (const ch of need.chapters) {
      const weak = (breakdownByChapter.get(ch) ?? [])
        .filter((b) => b.earned !== null && b.earned < WEAK_CHAPTER_SCORE && b.questionId !== null)
        .sort((a, b) => a.earned! - b.earned! || b.weight - a.weight);
      for (const b of weak) {
        const answer = byQuestion.get(b.questionId!);
        if (!answer) continue;
        if (evidence.some((e) => e.kind === 'reponse' && e.questionId === b.questionId)) continue;
        evidence.push({
          kind: 'reponse',
          questionId: b.questionId!,
          label: answer.label,
          value: answer.value,
          rule: b.rule,
          note: b.note,
          earned: b.earned!,
        });
        if (evidence.length >= MAX_EVIDENCE_PER_NEED + firedAlerts.length) break;
      }
    }

    // ── Les candidats ────────────────────────────────────────────────────────
    const scored = library
      .map((m) => {
        const s = scoreModule(m, need, weights);
        if (!s) return null;
        const candidate: ModuleCandidate = {
          moduleId: m.moduleId,
          title: m.title,
          family: moduleFamilyOf(m),
          source: m.source,
          score: s.score,
          matchSource: s.source,
          confidence: s.confidence,
          matchedSignals: s.signals,
          matchedTerms: s.terms,
          isFoundation: m.isFoundation,
          durationMin: m.durationMin,
        };
        return candidate;
      })
      .filter((c): c is ModuleCandidate => c !== null);

    // On sert dans la PREMIÈRE famille acceptée qui a des candidats (D-18). Un
    // besoin métier ne se sert donc jamais avec de l'IA tant qu'il n'a pas
    // déclaré l'accepter — et quand il l'accepte, le métier passe devant.
    const servedFamily = need.families.find((f) => scored.some((c) => c.family === f)) ?? null;
    const inFamily = servedFamily ? scored.filter((c) => c.family === servedFamily) : [];

    const metierGap = need.families[0] === 'METIER' && inFamily.length === 0 && scored.length > 0;

    const ranked = inFamily.sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.isFoundation) - Number(a.isFoundation) ||
        a.title.localeCompare(b.title, 'fr'),
    );
    const perSource = new Map<string, number>();
    const candidates: ModuleCandidate[] = [];
    for (const c of ranked) {
      if (candidates.length >= maxCandidates) break;
      const used = perSource.get(c.source.productId) ?? 0;
      if (used >= MAX_PER_SOURCE) continue;
      perSource.set(c.source.productId, used + 1);
      candidates.push(c);
    }

    for (const c of candidates) sourcesRetained.add(c.source.productId);

    if (metierGap) {
      notices.push(
        `« ${need.label} » est un besoin métier, et la bibliothèque n’offre que des modules hors métier pour y répondre (${[
          ...new Set(scored.map((c) => c.source.code)),
        ]
          .slice(0, 3)
          .join(', ')}). Aucun axe n’est proposé : c’est un manque de bibliothèque, pas une raison de vendre autre chose.`,
      );
    } else if (servedFamily !== null && servedFamily !== need.families[0] && candidates.length > 0) {
      notices.push(
        `« ${need.label} » : aucun module métier ne le couvre, c’est un module ${servedFamily === 'IA' ? 'IA' : servedFamily.toLowerCase()} qui est proposé (${candidates[0]!.title}). À confirmer.`,
      );
    } else if (candidates.length === 0) {
      notices.push(
        `Aucun module de la bibliothèque ne couvre « ${need.label} ». Le besoin est signalé, l’axe reste à composer à la main.`,
      );
    }

    if (candidates.length > 0 && candidates.every((c) => c.confidence === 'faible')) {
      notices.push(
        `« ${need.label} » : le rapprochement avec « ${candidates[0]!.title} » repose sur les mots de son intitulé, pas sur un signal du catalogue. À vérifier avant de l’envoyer.`,
      );
    }

    if (candidates.length > 0 && evidence.length === 0) {
      // Ne devrait pas arriver — un besoin ne se déclenche que sur une alerte
      // ou un chapitre faible. Si ça arrive, c'est que la réponse source n'a
      // pas été restituée : on le dit plutôt que de laisser un module non
      // justifié entrer dans une proposition (garde-fou D-20).
      notices.push(
        `« ${need.label} » : le besoin est déclenché mais aucune réponse du diagnostic ne le documente. À justifier à la main avant d’envoyer — un module qu’on ne sait pas expliquer ne passe pas un contrôle OPCO.`,
      );
    }

    recommendations.push({
      need,
      trigger,
      evidence,
      candidates,
      unmet: candidates.length === 0,
      metierGap,
    });
  }

  if (excluded.length > 0) {
    notices.push(
      `${excluded.length} module(s) écarté(s) d’office : interdits en sortie client (pige). Ils restent au catalogue interne.`,
    );
  }

  return {
    recommendations,
    notices,
    sourceProgrammeCount: sourcesRetained.size,
    libraryModuleCount: library.length,
  };
}
