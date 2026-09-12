/**
 * La liste de rattachement DOULEUR → MODULE RÉEL, à faire relire par Laurent.
 *
 *   pnpm --filter @qualiof/web propose:rattachement:local
 *
 * 100 % lecture. Aucune écriture en base. Le script produit UN fichier
 * Markdown dans `.planning/`, lisible par un non-développeur.
 *
 * ## Le problème qu'elle sert à régler
 *
 * Les étiquettes sont sur les mauvais modules. Ceux qui portent les signaux
 * diagnostic (rayons du catalogue diag) n'ont ni titre client ni déroulé ; ceux
 * du Drive et de Faros ont les deux, mais aucun signal. D'où, sur DIAG-0001,
 * huit « déroulé à compléter » sur huit.
 *
 * Ce script ne corrige RIEN. Il PROPOSE, et c'est délibéré : rattacher un
 * module à une douleur est une décision de catalogue, elle appartient à Laurent.
 * Il relit, corrige, valide — et c'est seulement ensuite qu'on écrit.
 *
 * ## Ce qu'il propose, et ce qu'il refuse de proposer
 *
 * Seulement des unités RÉELLES, c'est-à-dire animables :
 *   • un module du Drive ou de Faros qui porte un vrai déroulé ;
 *   • un produit QualiOF vendu, pris comme un tout (il porte son programme dans
 *     `programMd` mais n'a pas de modules).
 *
 * Sont écartés d'office : les modules sans déroulé (on ne peut pas animer ce qui
 * n'est pas écrit), la pige (interdite en sortie client), les programmes NON
 * DIFFUSABLES (D-19 ter), et les rayons en doublon d'un produit vendu — c'est la
 * version vendue qui fait foi (D-19 bis).
 *
 * Règle de famille (D-18) : une douleur métier appelle du MÉTIER. L'IA n'est
 * proposée que si le besoin l'accepte, et elle passe après.
 *
 * ## Ce que la relecture du 11/09/2026 a changé
 *
 *  1. **Un programme non diffusable ne se propose jamais** (D-19 ter). « L'Agent
 *     Incomparable » — v0.9, « NE PAS DIFFUSER AUX APPRENANTS » — arrivait en
 *     tête de deux douleurs : le filtre écartait la pige et les doublons, pas
 *     l'indiffusable. L'interdiction est maintenant dans la donnée, et le
 *     moteur de recommandation la tient aussi.
 *  2. **Deux mots pleins, ou rien** (D-27). Un rapprochement fondé sur un seul
 *     mot commun coûte plus de relecture qu'il n'en fait gagner : « formation »
 *     proposait de la déontologie à qui ignore ses droits AGEFICE, « collecte »
 *     proposait des e-mails à qui ne collecte pas d'avis. Mieux vaut une
 *     douleur déclarée non couverte qu'une ligne fausse à barrer.
 *  3. **Une douleur qui n'est pas un besoin de formation sort de l'exercice**
 *     (`answerableByTraining`, D-28) : ni proposée, ni comptée comme non couverte.
 *     Quatre règles sur trente-quatre, toutes de contexte ou de financement.
 *  4. **Le tri de Laurent fait foi** : ce qu'il a retenu est retenu, ce qu'il a
 *     barré ne revient pas. Le moteur ne repropose pas ce qui a déjà été jugé.
 */
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { prisma } from '@qualiof/db';
import {
  DIAGNOSTIC_CHAPTERS,
  DIAGNOSTIC_QUESTIONS,
  isInLightSet,
} from '@qualiof/shared/diagnostic';
import { catalogueTitleKey } from '@qualiof/shared/helpers';

import { listDiagnosticPainPoints } from '../src/lib/diagnostic-r1/scoring';
import {
  PROGRAMME_NEEDS,
  isAnimable,
  moduleFamilyOf,
  type LibraryModule,
  type ProgrammeFamily,
} from '../src/lib/proposition/module-matcher';
import { normalize } from '../src/lib/proposition/programme-matcher';
import {
  RATTACHEMENTS_IMPOSSIBLES,
  RATTACHEMENTS_VALIDES,
} from '../src/lib/proposition/rattachements-valides';

// ─────────────────────────────────────────────────────────────────────────────
// Le tri de Laurent — relecture du 11/09/2026
// ─────────────────────────────────────────────────────────────────────────────
//
// Ce bloc n'est pas une heuristique : c'est une DÉCISION, et elle prime sur le
// moteur dans les deux sens. Ce qui est `retenu` reste affiché même si la règle
// des deux mots ne le reproposerait pas — « compromis » et « coaching » sont des
// mots uniques, mais ce sont les BONS, et Laurent a déjà payé le temps de
// relecture. Ce qui est `ecarte` ne remonte plus jamais.
//
// Les unités retenues sont retrouvées par leur titre et le code de leur
// programme d'origine. Si l'une disparaît du catalogue, le rapport le DIT en
// tête plutôt que de laisser tomber une décision en silence.

type Arbitrage =
  | {
      verdict: 'retenu';
      unites: { titre: string; origine: string }[];
      /**
       * Ce que Laurent a voulu dire en retenant ce module — une réserve, une
       * intention d'écriture. Un rattachement « le meilleur contenu existant »
       * n'est pas la même décision qu'un rattachement « c'est exactement ça »,
       * et le rapport doit porter la différence.
       */
      note?: string;
    }
  | { verdict: 'ecarte'; motif: string };

const ARBITRAGES: Record<string, Arbitrage> = {
  // ── Gardées ───────────────────────────────────────────────────────────────
  //
  // Elles ne sont PAS recopiées ici : elles viennent de
  // `lib/proposition/rattachements-valides.ts`, le fichier que lit aussi
  // l'écriture en base. Deux tables se seraient séparées au premier changement
  // d'avis, et l'écart ne se serait vu qu'une fois une mauvaise proposition
  // partie chez un client.
  ...Object.fromEntries(
    RATTACHEMENTS_VALIDES.map((r): [string, Arbitrage] => [
      r.ruleId,
      {
        verdict: 'retenu',
        unites: r.cibles.map((c) => ({ titre: c.module, origine: c.programme })),
        note: r.reserve,
      },
    ]),
  ),
  // Retenues par Laurent, mais impossibles à écrire : le produit vendu ne porte
  // aucun module, et un signal se pose sur un module. Elles restent affichées
  // comme rattachées — la décision est prise — avec l'obstacle en clair.
  ...Object.fromEntries(
    RATTACHEMENTS_IMPOSSIBLES.map((r): [string, Arbitrage] => [
      r.ruleId,
      {
        verdict: 'retenu',
        unites: r.retenu.map((x) => {
          const [code, ...reste] = x.split(' — ');
          return { titre: reste.join(' — '), origine: code! };
        }),
        note: `⚠️ **Pas encore écrit en base.** ${r.obstacle}`,
      },
    ]),
  ),

  // ── Barrées ───────────────────────────────────────────────────────────────
  //
  // Elles n'intéressent que ce rapport : on n'écrit rien pour une douleur dont
  // la proposition était fausse.
  'contacts-vers-rdv': {
    verdict: 'ecarte',
    motif: 'le mot « contacts » menait à une formation aux newsletters',
  },
  indicateurs: { verdict: 'ecarte', motif: 'accroché au seul mot « régulièrement »' },
  'visites-par-vente': {
    verdict: 'ecarte',
    motif: 'le mot « nécessaires » menait à une synthèse de journée de tournage',
  },
  'collecte-avis': {
    verdict: 'ecarte',
    motif: 'le mot « collecte » menait à une collecte d’e-mails, pas d’avis',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Les unités RÉELLEMENT animables
// ─────────────────────────────────────────────────────────────────────────────

interface RealUnit {
  kind: 'module' | 'produit';
  /** Ce qu'on lit sur la liste : « Prospecter autrement… ». */
  title: string;
  /** D'où il vient : « Drive 058 Booster vendeur », « PROD-055 (vendu) ». */
  origin: string;
  /** Le code du programme d'origine — `BIB-D034`, `PROD-0042`. */
  originCode: string;
  /**
   * La clé du PROGRAMME d'origine, pour reconnaître le même programme importé
   * deux fois. `drive:008` « Face à face acheteurs » et `drive:020` « Face a
   * face acheteurs » sont un seul programme : sans cette clé, ils prenaient
   * deux des trois places de la douleur « découverte vendeur ».
   */
  programmeKey: string;
  family: ProgrammeFamily;
  /**
   * Les MOTS du titre, pas son texte.
   *
   * Un `includes` sur une chaîne compare des fragments : « part » y matche
   * « participation » et « partenariats », et une formation au recrutement
   * remontait ainsi en tête de la douleur « part d'exclusivité ». On compare
   * donc des mots entiers, jamais des morceaux de mots.
   */
  words: Set<string>;
}

/** Les mots vides du français, qui ne qualifient rien. */
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'et', 'ou', 'en', 'a',
  'est', 'sont', 'ce', 'cet', 'cette', 'ses', 'son', 'sa', 'leur', 'leurs', 'par', 'pour',
  'sur', 'dans', 'avec', 'sans', 'plus', 'moins', 'que', 'qui', 'quoi', 'dont', 'vous',
  'nous', 'ils', 'elle', 'elles', 'il', 'on', 'y', 'se', 'ne', 'pas', 'est-ce', 'quel',
  'quelle', 'quels', 'quelles', 'combien', 'comment', 'place', 'mise', 'etes', 'avez',
  'faire', 'fait', 'bien', 'tres', 'entre', 'chaque', 'tout', 'tous', 'toute', 'toutes',
  'votre', 'vos', 'notre', 'nos', 'etre', 'avoir',
  // Adverbes et repères de temps. Ils sont RARES dans les titres du catalogue,
  // donc la mesure de rareté leur donnait un poids plein — et « avant » faisait
  // remonter une formation au recrutement sur le financement acquéreur. Rare
  // n'est pas la même chose que qualifiant.
  'avant', 'apres', 'pendant', 'depuis', 'quand', 'moment', 'aussi', 'encore',
  'deja', 'jamais', 'souvent', 'parfois', 'toujours', 'reellement', 'vraiment',
  'certains', 'certaines', 'autre', 'autres', 'meme', 'memes', 'ainsi', 'donc',
  'alors', 'ensuite', 'enfin', 'puis', 'niveau', 'cas', 'type', 'sorte',
]);

function terms(text: string): string[] {
  return [
    ...new Set(
      normalize(text)
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ];
}

/**
 * Le pouvoir discriminant d'un mot, mesuré sur les unités réelles.
 *
 * Même doctrine que le moteur de recommandation (D-18) : un mot présent dans la
 * moitié du catalogue ne qualifie rien. La mesure se refait ici sur le sous-
 * ensemble « animable », qui n'est pas le même que la bibliothèque entière.
 */
function weightsOver(units: RealUnit[], allTerms: string[]): Map<string, number> {
  const w = new Map<string, number>();
  for (const t of allTerms) {
    if (w.has(t)) continue;
    const share = units.filter((u) => u.words.has(t)).length / Math.max(1, units.length);
    w.set(t, share <= 0.05 ? 1 : share <= 0.15 ? 0.6 : share <= 0.35 ? 0.25 : 0);
  }
  return w;
}

// ─────────────────────────────────────────────────────────────────────────────

const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
if (!tenant) throw new Error('Aucun tenant');

const products = await prisma.trainingProduct.findMany({
  where: { tenantId: tenant.id },
  select: {
    id: true, code: true, title: true, theme: true, isActive: true, fundingType: true,
    sourceRef: true, supersededByProductId: true, excludedFromClientOutputs: true, programMd: true,
    modules: {
      orderBy: { order: 'asc' },
      select: {
        id: true, title: true, contentMd: true, needIdentification: true, family: true,
        targetProfile: true, durationMin: true, diagnosticSignals: true, isFoundation: true,
        excludedFromClientOutputs: true,
      },
    },
  },
});

const units: RealUnit[] = [];
let ecartesSansDeroule = 0;
let ecartesPige = 0;
let ecartesDoublon = 0;
let ecartesNonDiffusable = 0;

for (const p of products) {
  // D-19 ter — un programme non diffusable n'est pas un rayon de bibliothèque,
  // c'est une interdiction. Ni lui, ni aucun de ses modules ne sortent.
  if (p.excludedFromClientOutputs) {
    ecartesNonDiffusable += p.modules.length;
    continue;
  }

  // D-19 bis — un rayon en doublon d'un produit vendu ne se propose pas.
  if (p.supersededByProductId) {
    ecartesDoublon += p.modules.length;
    continue;
  }

  for (const m of p.modules) {
    if (m.excludedFromClientOutputs) {
      ecartesPige += 1;
      continue;
    }
    // La définition d'« animable » vit dans le moteur, pas ici : depuis le
    // 11/09/2026 le composeur applique la même, et deux définitions auraient
    // fini par diverger.
    if (!isAnimable(m)) {
      ecartesSansDeroule += 1;
      continue;
    }
    const lib: LibraryModule = {
      moduleId: m.id, title: m.title, family: m.family, targetProfile: m.targetProfile,
      signals: [], needIdentification: m.needIdentification, isFoundation: m.isFoundation,
      durationMin: m.durationMin, excludedFromClientOutputs: false, contentMd: m.contentMd,
      source: {
        productId: p.id, code: p.code, title: p.title, theme: p.theme,
        fundingType: p.fundingType, isActive: p.isActive, supersededBy: null,
        excludedFromClientOutputs: false,
      },
    };
    units.push({
      kind: 'module',
      title: m.title,
      origin: `${p.title} (${p.code})`,
      originCode: p.code,
      programmeKey: catalogueTitleKey(p.title),
      family: moduleFamilyOf(lib),
      // Le TITRE et la famille, jamais le contenu détaillé. C'est la leçon
      // D-18 : dans un déroulé pédagogique, « vente », « client » et « suivi »
      // apparaissent partout. Lire le contenu faisait remonter un module
      // AGEFICE en tête de trois douleurs métier, accroché par « part »,
      // « quand » et « mois ». Le contenu dit si un module est ANIMABLE ; il ne
      // dit pas de quoi il parle.
      words: new Set(terms(`${m.title} ${m.family ?? ''}`)),
    });
  }

  // Un produit VENDU se propose comme un tout : il porte son programme dans
  // `programMd` et n'a pas de modules (c'est le cas de tout le catalogue
  // commercial historique).
  if (p.isActive && p.sourceRef === null && p.modules.length === 0 && p.programMd.trim().length > 50) {
    units.push({
      kind: 'produit',
      title: p.title,
      origin: `${p.code} — produit vendu`,
      originCode: p.code,
      programmeKey: catalogueTitleKey(p.title),
      family:
        p.fundingType === 'REGLEMENTAIRE'
          ? 'REGLEMENTAIRE'
          : /\b(ia|intelligence artificielle|chatgpt|claude|copilot|prompt)\b/.test(
                normalize(`${p.title} ${p.theme ?? ''}`),
              )
            ? 'IA'
            : 'METIER',
      // Idem pour un produit vendu : son `programMd` fait des milliers de mots.
      words: new Set(terms(`${p.title} ${p.theme ?? ''}`)),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Les programmes importés DEUX FOIS
// ─────────────────────────────────────────────────────────────────────────────
//
// Signalés, jamais tranchés : lequel des deux dossiers fait foi est une
// décision de catalogue. En attendant, on évite au moins qu'ils occupent deux
// places sur une même douleur.

interface Exemplaire {
  code: string;
  titre: string;
  estVendu: boolean;
  /** Le code du programme au profit duquel il s'efface, `null` s'il reste. */
  ecarteAuProfitDe: string | null;
}

const codeParId = new Map(products.map((p) => [p.id, p.code]));

const programmesParCle = new Map<string, Map<string, Exemplaire>>();
for (const p of products) {
  if (p.modules.length === 0 && p.programMd.trim().length <= 50) continue;
  const k = catalogueTitleKey(p.title);
  const groupe = programmesParCle.get(k) ?? new Map<string, Exemplaire>();
  groupe.set(p.code, {
    code: p.code,
    titre: p.title,
    estVendu: p.sourceRef === null && p.isActive,
    ecarteAuProfitDe: p.supersededByProductId
      ? (codeParId.get(p.supersededByProductId) ?? p.supersededByProductId)
      : null,
  });
  programmesParCle.set(k, groupe);
}

/**
 * Quatre situations derrière le mot « doublon », et les confondre ferait
 * relire à Laurent des décisions qu'il a déjà prises :
 *
 *   • `regle-vendu`  — le rayon s'efface devant un produit VENDU. C'est D-19
 *     bis, une règle : rien à décider, jamais.
 *   • `regle-arbitrage` — deux RAYONS, et c'est Laurent qui a désigné celui qui
 *     fait foi. Le rayon écarté **reste en base** : on le DIT, on ne le fait
 *     pas disparaître du rapport — sinon la décision devient invisible et
 *     quelqu'un la reprendra un jour depuis zéro.
 *   • `automatique` — un rayon face à un produit vendu, pas encore lié : le
 *     prochain import posera le lien seul. Informatif.
 *   • `a-trancher` — deux rayons, personne n'a tranché. Seul cas qui demande
 *     quelque chose à Laurent.
 */
type StatutDoublon = 'regle-vendu' | 'regle-arbitrage' | 'automatique' | 'a-trancher';

function statutDe(g: Exemplaire[]): StatutDoublon {
  const ecarte = g.find((x) => x.ecarteAuProfitDe !== null);
  if (ecarte) {
    const gardien = g.find((x) => x.code === ecarte.ecarteAuProfitDe);
    return gardien?.estVendu ? 'regle-vendu' : 'regle-arbitrage';
  }
  return g.some((x) => x.estVendu) ? 'automatique' : 'a-trancher';
}

const doublonsImport = [...programmesParCle.values()]
  .filter((g) => g.size > 1)
  .map((g) => [...g.values()])
  .map((g) => ({ exemplaires: g, statut: statutDe(g) }));

const doublonsATrancher = doublonsImport.filter((d) => d.statut === 'a-trancher');
const doublonsAutomatiques = doublonsImport.filter((d) => d.statut === 'automatique');
const doublonsArbitres = doublonsImport.filter((d) => d.statut === 'regle-arbitrage');
const doublonsRegleParLaRegle = doublonsImport.filter((d) => d.statut === 'regle-vendu');

// ─────────────────────────────────────────────────────────────────────────────
// Les douleurs du référentiel
// ─────────────────────────────────────────────────────────────────────────────

const questionById = new Map(DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]));
const chapterTitle = new Map(DIAGNOSTIC_CHAPTERS.map((c) => [c.chapter, c.title]));

interface Douleur {
  ruleId: string;
  chapter: number;
  chapterTitle: string;
  label: string;
  questionId: string | null;
  /** Posée à TOUS les diagnostics (set léger) ou seulement en complet ? */
  aTous: boolean;
  weight: number;
  needCode: string | null;
  families: readonly ProgrammeFamily[];
  terms: string[];
}

const toutesLesRegles = listDiagnosticPainPoints();

// Correctif 3 — une douleur qui n'est pas un besoin de formation sort de
// l'exercice : ni proposée, ni comptée comme « non couverte ». Le chiffre des
// douleurs à combler s'en trouve rectifié, et il décourage moins pour de bon.
const horsChamp = toutesLesRegles.filter((p) => !p.answerableByTraining);

const douleurs: Douleur[] = toutesLesRegles
  .filter((p) => p.answerableByTraining)
  .map((p) => {
    const q = p.questionId ? questionById.get(p.questionId) : undefined;
    const need = PROGRAMME_NEEDS.find((n) => n.chapters.includes(p.chapter));
    return {
      ruleId: p.ruleId,
      chapter: p.chapter,
      chapterTitle: chapterTitle.get(p.chapter as never) ?? `Chapitre ${p.chapter}`,
      label: p.note,
      questionId: p.questionId,
      aTous: p.questionId ? isInLightSet(p.questionId) : true,
      weight: p.weight,
      needCode: need?.code ?? null,
      families: need?.families ?? ['METIER'],
      terms: terms(`${p.note} ${q?.question ?? ''}`),
    };
  });

const allTerms = [...new Set(douleurs.flatMap((d) => d.terms))];
const weights = weightsOver(units, allTerms);

interface Candidat {
  unit: RealUnit;
  score: number;
  mots: string[];
}

interface Proposition {
  douleur: Douleur;
  /** Ce que le moteur propose AUJOURD'HUI, règle des deux mots appliquée. */
  candidats: Candidat[];
  /**
   * Ce que la règle des deux mots a fait tomber — un seul mot commun suffisait
   * hier. On le garde pour le DIRE : Laurent n'a pas eu à les barrer, mais il
   * doit savoir qu'ils ont disparu, sinon il croira à un oubli.
   */
  tombesAvecDeuxMots: Candidat[];
}

/**
 * D-27 — **deux mots pleins concordants, ou rien.**
 *
 * L'ancienne règle laissait passer un mot unique s'il était rare et long ≥ 8.
 * Rare et long n'est pas qualifiant : « formation », « collecte »,
 * « nécessaires », « régulièrement » et « contacts » ont tous produit une ligne
 * fausse le 11/09. Une ligne fausse se relit, se comprend, se barre — elle
 * coûte plus cher que la douleur non couverte qu'elle remplaçait.
 */
function retenuParLeMoteur(c: Candidat): boolean {
  return c.mots.length >= 2;
}

const propositions: Proposition[] = douleurs.map((d) => {
  const scored = units.map((unit) => {
    const mots = d.terms.filter((t) => (weights.get(t) ?? 0) > 0 && unit.words.has(t));
    const score = mots.reduce((s, t) => s + (weights.get(t) ?? 0), 0);
    return { unit, score: Math.round(score * 100) / 100, mots };
  });

  // D-18 — on sert dans la première famille acceptée par le besoin.
  const qualifiants = scored.filter(retenuParLeMoteur);
  const served = d.families.find((f) => qualifiants.some((c) => c.unit.family === f)) ?? null;
  const inFamily = served ? qualifiants.filter((c) => c.unit.family === served) : [];

  // Le même programme importé deux fois ne prend qu'une place.
  const vus = new Set<string>();
  const candidats: Candidat[] = [];
  for (const c of [...inFamily].sort((a, b) => b.score - a.score)) {
    const cle = `${c.unit.programmeKey}::${catalogueTitleKey(c.unit.title)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    candidats.push(c);
    if (candidats.length === 3) break;
  }

  // Ce que l'ancienne règle aurait proposé et que la nouvelle refuse.
  const ancienne = scored.filter(
    (c) => !retenuParLeMoteur(c) && c.score >= 1 && c.mots.some((m) => m.length >= 8),
  );
  const familleAncienne = d.families.find((f) => ancienne.some((c) => c.unit.family === f)) ?? null;

  return {
    douleur: d,
    candidats,
    tombesAvecDeuxMots: familleAncienne
      ? ancienne
          .filter((c) => c.unit.family === familleAncienne)
          .sort((a, b) => b.score - a.score)
          .slice(0, 1)
      : [],
  };
});

// Fréquence d'apparition : d'abord ce qui est demandé à TOUS les diagnostics,
// puis le poids que Laurent a lui-même donné à la règle dans son barème.
const parPriorite = (a: Proposition, b: Proposition) => {
  if (a.douleur.aTous !== b.douleur.aTous) return a.douleur.aTous ? -1 : 1;
  return b.douleur.weight - a.douleur.weight || a.douleur.chapter - b.douleur.chapter;
};
propositions.sort(parPriorite);

// ─────────────────────────────────────────────────────────────────────────────
// Le tri de Laurent, appliqué
// ─────────────────────────────────────────────────────────────────────────────

interface UniteRetenue {
  titre: string;
  origine: string;
  trouvee: boolean;
}

const retenues: { douleur: Douleur; unites: UniteRetenue[]; note?: string }[] = [];
const barrees: { douleur: Douleur; motif: string }[] = [];
const aRelire: Proposition[] = [];
const perdues: string[] = [];

for (const p of propositions) {
  const arbitrage = ARBITRAGES[p.douleur.ruleId];

  if (arbitrage?.verdict === 'ecarte') {
    barrees.push({ douleur: p.douleur, motif: arbitrage.motif });
    continue;
  }

  if (arbitrage?.verdict === 'retenu') {
    const unites = arbitrage.unites.map((u) => {
      const trouvee = units.some(
        (unit) =>
          unit.originCode === u.origine && catalogueTitleKey(unit.title) === catalogueTitleKey(u.titre),
      );
      if (!trouvee) {
        perdues.push(
          `« ${u.titre} » (${u.origine}), retenue pour « ${p.douleur.label} », **n'est plus une unité animable du catalogue**.`,
        );
      }
      return { titre: u.titre, origine: u.origine, trouvee };
    });
    retenues.push({ douleur: p.douleur, unites, note: arbitrage.note });
    continue;
  }

  if (p.candidats.length > 0) aRelire.push(p);
}

const sansProposition = propositions.filter(
  (p) => !ARBITRAGES[p.douleur.ruleId] && p.candidats.length === 0,
);
const tombees = propositions.filter(
  (p) => !ARBITRAGES[p.douleur.ruleId] && p.candidats.length === 0 && p.tombesAvecDeuxMots.length > 0,
);

// ─────────────────────────────────────────────────────────────────────────────
// Le rapport
// ─────────────────────────────────────────────────────────────────────────────

const md: string[] = [
  `# Quel module pour quelle douleur — ${aRelire.length === 0 && doublonsATrancher.length === 0 ? 'liste VALIDÉE' : 'à relire'} (v2)`,
  '',
  `_Régénérée le ${new Date().toISOString().slice(0, 10)} · tenant « ${tenant.name} ». **Les rattachements ne sont pas encore écrits en base.**_`,
  '',
  '## Ce qui a changé depuis ta relecture',
  '',
  `- **« L'Agent Incomparable » ne peut plus être proposé** — ni lui, ni aucun de ses modules. Le parcours est marqué non diffusable dans la donnée, pas seulement dans son manifeste, et le moteur de recommandation le tient aussi (${ecartesNonDiffusable} module(s) écartés d'office).`,
  `- **Deux mots pleins concordants, ou rien.** Un rapprochement à un seul mot n'est plus proposé du tout. C'est ce qui faisait remonter de la déontologie sur « droits à formation » et une collecte d'e-mails sur « collecte d'avis ».`,
  `- **Quatre douleurs sortent de l'exercice** : elles décrivent un contexte ou un financement, aucun module n'y répondra jamais (§5). Elles ne sont plus comptées comme « non couvertes ».`,
  `- **Le chiffre du contenu à écrire monte à ${sansProposition.length + barrees.length}**, et c'est voulu. Les 4 douleurs hors champ en sortent, mais les ${barrees.length} que tu as barrées y entrent, plus les ${tombees.length} tombées avec la règle des deux mots : une proposition fausse ne couvrait rien, elle le cachait. 17 était le chiffre rassurant ; ${sansProposition.length + barrees.length} est le chiffre vrai.`,
  `- **Ton tri du 11/09 fait foi** : ce que tu as retenu est ici, ce que tu as barré ne revient pas.`,
  '',
];

if (perdues.length > 0) {
  md.push(
    '> ### ⚠️ Une décision ne retrouve plus son module',
    '>',
    "> Le catalogue a bougé depuis ta relecture. Plutôt que de laisser tomber ta décision en silence :",
    '>',
    ...perdues.map((l) => `> - ${l}`),
    '',
  );
}

md.push(
  '## En un coup d’œil',
  '',
  `- **${units.length} unités animables** au catalogue (${units.filter((u) => u.kind === 'module').length} modules, ${units.filter((u) => u.kind === 'produit').length} produits vendus)`,
  `- **${douleurs.length} douleurs** entrent dans l'exercice du rattachement (${horsChamp.length} en sortent : contexte et financement)`,
  `- **${retenues.length} douleurs rattachées** — ton tri, applicable tel quel`,
  aRelire.length === 0
    ? `- **aucune douleur en attente de relecture** — tout ce qui reçoit une proposition est tranché`
    : `- **${aRelire.length} douleur${aRelire.length > 1 ? 's' : ''} à relire** — ${aRelire.length > 1 ? 'nouvelles propositions, pas encore jugées' : 'nouvelle proposition, pas encore jugée'}`,
  `- **${sansProposition.length + barrees.length} douleurs restent sans réponse** — ${sansProposition.length} sans aucune proposition, plus ${barrees.length} dont la proposition était fausse et que tu as barrée. C'est là que du contenu reste à écrire.`,
  `- **Écarté d'office** : ${ecartesSansDeroule} module(s) sans déroulé, ${ecartesPige} de pige, ${ecartesNonDiffusable} d'un programme non diffusable (D-19 ter), ${ecartesDoublon} d'un rayon en doublon — d'un produit vendu (D-19 bis) ou d'un autre rayon que tu as tranché`,
  '',
  '---',
  '',
  '## 1 · Rattaché — ton tri du 11/09',
  '',
  'Rien à faire ici, sauf si tu changes d’avis. C’est ce qui sera écrit en base à ta validation.',
  '',
  '| # | Douleur | Posée à | Module retenu | D’où il vient |',
  '|---|---|---|---|---|',
);

let n = 0;
for (const r of retenues) {
  n += 1;
  const [premiere, ...suite] = r.unites;
  md.push(
    `| ${n} | **${r.douleur.label}**<br><small>ch. ${r.douleur.chapter} — ${r.douleur.chapterTitle}</small> | ${r.douleur.aTous ? 'tous' : 'complet seulement'} | ${premiere?.trouvee === false ? '⚠️ ' : ''}${premiere?.titre ?? '—'} | ${premiere?.origine ?? '—'} |`,
  );
  for (const u of suite) {
    md.push(`| | _puis_ | | ${u.trouvee ? '' : '⚠️ '}${u.titre} | ${u.origine} |`);
  }
  if (r.note) md.push(`| | _ta réserve_ | | ${r.note} | |`);
}

md.push(
  '',
  '---',
  '',
  '## 2 · À relire — ce qui n’a pas encore été jugé',
  '',
  aRelire.length > 0
    ? 'Deux mots pleins au minimum ont fait chacun de ces rapprochements. Tu corriges, tu barres, tu valides.'
    : '_Vide, et c’est le but : toutes les douleurs qui reçoivent une proposition ont été jugées le 11/09. Une ligne réapparaîtra ici le jour où le catalogue bougera assez pour produire un rapprochement neuf à deux mots pleins._',
  '',
);

if (aRelire.length > 0) {
  md.push('| # | Douleur | Posée à | Proposition | D’où elle vient | Pourquoi |', '|---|---|---|---|---|---|');
  let m = 0;
  for (const p of aRelire) {
    m += 1;
    const first = p.candidats[0]!;
    md.push(
      `| ${m} | **${p.douleur.label}**<br><small>ch. ${p.douleur.chapter} — ${p.douleur.chapterTitle}</small> | ${p.douleur.aTous ? 'tous' : 'complet seulement'} | ${first.unit.title} | ${first.unit.origin} | ${first.mots.join(', ')} |`,
    );
    for (const c of p.candidats.slice(1)) {
      md.push(`| | _autre piste_ | | ${c.unit.title} | ${c.unit.origin} | ${c.mots.join(', ')} |`);
    }
  }
  md.push('');
}

if (barrees.length > 0) {
  md.push(
    '---',
    '',
    '## 3 · Barré le 11/09 — ne revient plus',
    '',
    'Ces rapprochements sont enregistrés comme refusés. Le moteur ne les reproposera pas, même si le catalogue bouge.',
    '',
    '| Douleur | Chapitre | Pourquoi c’était faux |',
    '|---|---|---|',
  );
  for (const b of barrees) {
    md.push(`| ${b.douleur.label} | ${b.douleur.chapter} — ${b.douleur.chapterTitle} | ${b.motif} |`);
  }
  md.push('');
}

if (tombees.length > 0) {
  md.push(
    '---',
    '',
    '## 4 · Tombé tout seul — tu n’as pas eu à le barrer',
    '',
    'La règle des deux mots a écarté ces propositions du 11/09 sans que tu aies à les lire. Elles sont ici pour que leur disparition ne passe pas pour un oubli : ces douleurs sont désormais comptées comme **non couvertes**.',
    '',
    '| Douleur | Ce qui était proposé | Le mot unique qui l’accrochait |',
    '|---|---|---|',
  );
  for (const p of tombees) {
    const c = p.tombesAvecDeuxMots[0]!;
    md.push(`| ${p.douleur.label} | ${c.unit.title} <br><small>${c.unit.origin}</small> | ${c.mots.join(', ')} |`);
  }
  md.push('');
}

md.push(
  '---',
  '',
  '## 5 · Hors du champ du rattachement',
  '',
  "Ces douleurs se notent dans l'audit — savoir que le dirigeant ignore ses droits change le rendez-vous — mais aucun module n'y répondra jamais : la réponse est un dossier de financement ou un fait de marché, pas un programme. Elles ne sont donc **ni proposées, ni comptées comme non couvertes**.",
  '',
  '| Douleur | Chapitre | La vraie réponse |',
  '|---|---|---|',
);
const VRAIE_REPONSE: Record<string, string> = {
  'transaction-ancien': 'un fait de marché — il qualifie le contexte, il ne se forme pas',
  'droits-connus': 'l’explication des droits en rendez-vous, puis le dossier AGEFICE',
  'formations-24m': 'un fait de financement — il conditionne l’éligibilité, pas le programme',
  'sans-refus': 'le traitement du refus avec le financeur',
};
for (const p of horsChamp) {
  md.push(
    `| ${p.note} | ${p.chapter} — ${chapterTitle.get(p.chapter as never) ?? p.chapter} | ${VRAIE_REPONSE[p.ruleId] ?? '—'} |`,
  );
}

md.push(
  '',
  '---',
  '',
  '## 6 · Les douleurs que RIEN ne couvre',
  '',
  `**${sansProposition.length} douleurs** n'ont aucun module ni produit animable qui leur réponde. Aucun rapprochement n'a été inventé pour elles : c'est ici que du contenu reste à écrire.`,
  '',
  `Les **${barrees.length} douleurs barrées** du §3 sont à ajouter à cette liste : leur proposition était fausse, elles ne sont donc pas couvertes non plus. Soit **${sansProposition.length + barrees.length} douleurs** au total.`,
  '',
  '| Douleur | Chapitre | Posée à | Famille attendue |',
  '|---|---|---|---|',
);
for (const p of sansProposition) {
  md.push(
    `| ${p.douleur.label} | ${p.douleur.chapter} — ${p.douleur.chapterTitle} | ${p.douleur.aTous ? 'tous' : 'complet seulement'} | ${p.douleur.families.join(' puis ')} |`,
  );
}

if (doublonsImport.length > 0) {
  md.push('', '---', '', '## 7 · Le même programme deux fois', '');
}

if (doublonsArbitres.length > 0) {
  md.push(
    '### Tranché par toi — le rayon écarté reste en base',
    '',
    "Deux rayons portaient le même programme, et aucune règle ne pouvait choisir : entre deux rayons, il n'y a pas de « version vendue » qui fasse foi. Tu as désigné celui qui reste. **Le rayon écarté n'est pas supprimé** — il reste consultable, seuls ses modules sortent de la composition, et le lien est posé une fois pour toutes : **un prochain import du Drive ne peut pas le réintroduire**.",
    '',
    '| Gardé | Écarté |',
    '|---|---|',
  );
  for (const d of doublonsArbitres) {
    const ecarte = d.exemplaires.find((x) => x.ecarteAuProfitDe !== null)!;
    const garde = d.exemplaires.find((x) => x.code === ecarte.ecarteAuProfitDe);
    md.push(`| \`${garde?.code ?? '?'}\` « ${garde?.titre ?? '?'} » | \`${ecarte.code}\` « ${ecarte.titre} » |`);
  }
  md.push('');
}

if (doublonsATrancher.length > 0) {
  md.push(
    '### À trancher — deux rayons, aucune règle ne peut choisir',
    '',
    "Le même programme a été importé depuis deux dossiers source différents. **Rien n'a été supprimé** : aucune règle ne sait lequel garder, parce qu'aucun des deux n'est le « produit vendu » qui ferait foi. Garde celui dont le découpage en modules te convient.",
    '',
    'Tant que les deux sont là, ils se disputent la même place sur une douleur — c’est ce qui proposait deux fois le même module de découverte le 11/09.',
    '',
    '| Programme | Les deux exemplaires |',
    '|---|---|',
  );
  for (const d of doublonsATrancher) {
    md.push(
      `| ${d.exemplaires[0]!.titre} | ${d.exemplaires.map((x) => `\`${x.code}\` « ${x.titre} »`).join('<br>')} |`,
    );
  }
  md.push('');
}

if (doublonsAutomatiques.length > 0) {
  md.push(
    '### Pour information — ceux-là se règlent seuls',
    '',
    "Ces doublons-là opposent un rayon importé à un **produit que tu vends** : D-19 bis sait trancher, c'est la version vendue qui fait foi. Ils avaient échappé à la détection parce que les deux titres ne diffèrent que par une apostrophe typographique. **Le prochain import les écartera** — rien à faire de ton côté.",
    '',
    '| Programme | Le rayon qui s’effacera |',
    '|---|---|',
  );
  for (const d of doublonsAutomatiques) {
    const vendu = d.exemplaires.find((x) => x.estVendu);
    const rayon = d.exemplaires.find((x) => !x.estVendu);
    md.push(
      `| \`${vendu?.code ?? '?'}\` « ${vendu?.titre ?? '?'} » | \`${rayon?.code ?? '?'}\` « ${rayon?.titre ?? '?'} » |`,
    );
  }
  md.push('');
}

if (doublonsRegleParLaRegle.length > 0) {
  md.push(
    `_Pour mémoire : **${doublonsRegleParLaRegle.length} autres doublons** sont réglés par D-19 bis — le rayon s'efface devant le produit vendu (${doublonsRegleParLaRegle
      .map((d) => `\`${d.exemplaires.find((x) => x.ecarteAuProfitDe !== null)?.code ?? '?'}\``)
      .join(', ')}). C'est une règle, pas une décision : rien à relire._`,
    '',
  );
}

md.push(
  '',
  '---',
  '',
  '## Ce qu’il se passe après ta relecture',
  '',
  aRelire.length > 0 || doublonsATrancher.length > 0
    ? `1. Tu relis le §2${doublonsATrancher.length > 0 ? ' et tu tranches le §7' : ''}. Le reste est déjà décidé.`
    : '1. **Rien ne t’attend dans ce document** — tout est tranché. Il est ici comme trace de ce qui va être écrit.',
  '2. On écrit le rattachement : le module retenu reçoit le **signal** de sa douleur, et devient donc recommandable **avec** son déroulé.',
  '3. Le parcours composé cesse de sortir « déroulé à compléter », et son programme Qualiopi redevient remettable.',
  '',
);

const out = path.resolve(process.cwd(), '../../.planning/260911-rattachement-douleur-module.md');
writeFileSync(out, `${md.join('\n')}\n`, 'utf8');

console.log(`\n=== ${units.length} unités animables · ${douleurs.length} douleurs dans l'exercice ===`);
console.log(`    ${retenues.length} rattachées (ton tri) · ${aRelire.length} à relire · ${barrees.length} barrées · ${sansProposition.length} sans proposition`);
console.log(`    écartés : ${ecartesSansDeroule} sans déroulé · ${ecartesPige} pige · ${ecartesNonDiffusable} non diffusable · ${ecartesDoublon} doublon`);
if (perdues.length > 0) console.log(`    ⚠️  ${perdues.length} décision(s) ne retrouvent plus leur module`);
if (doublonsATrancher.length > 0) console.log(`    ⚠️  ${doublonsATrancher.length} programme(s) en double, à trancher par Laurent`);
if (doublonsArbitres.length > 0) console.log(`    ✔️  ${doublonsArbitres.length} doublon(s) rayon/rayon tranché(s) par Laurent`);
if (doublonsAutomatiques.length > 0) console.log(`    ℹ️  ${doublonsAutomatiques.length} doublon(s) rayon/produit vendu, que le prochain import écartera (D-19 bis)`);
console.log(`\n    Liste à relire : ${path.relative(process.cwd(), out)}\n`);

await prisma.$disconnect();
