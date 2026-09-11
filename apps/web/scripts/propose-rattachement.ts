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
 * n'est pas écrit), la pige (interdite en sortie client), et les rayons en
 * doublon d'un produit vendu — c'est la version vendue qui fait foi (D-19 bis).
 *
 * Règle de famille (D-18) : une douleur métier appelle du MÉTIER. L'IA n'est
 * proposée que si le besoin l'accepte, et elle passe après.
 */
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { prisma } from '@qualiof/db';
import {
  DIAGNOSTIC_CHAPTERS,
  DIAGNOSTIC_QUESTIONS,
  isInLightSet,
} from '@qualiof/shared/diagnostic';

import { listDiagnosticPainPoints } from '../src/lib/diagnostic-r1/scoring';
import {
  PROGRAMME_NEEDS,
  moduleFamilyOf,
  type LibraryModule,
  type ProgrammeFamily,
} from '../src/lib/proposition/module-matcher';
import { normalize } from '../src/lib/proposition/programme-matcher';

// ─────────────────────────────────────────────────────────────────────────────
// Les unités RÉELLEMENT animables
// ─────────────────────────────────────────────────────────────────────────────

interface RealUnit {
  kind: 'module' | 'produit';
  /** Ce qu'on lit sur la liste : « Prospecter autrement… ». */
  title: string;
  /** D'où il vient : « Drive 058 Booster vendeur », « PROD-055 (vendu) ». */
  origin: string;
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

/** En dessous, un rapprochement ne tient qu'à des mots passe-partout. */
const QUALIFIANT = 1;

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
    sourceRef: true, supersededByProductId: true, programMd: true,
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

for (const p of products) {
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
    const content = (m.contentMd ?? '').trim();
    const questions = (m.needIdentification ?? '').trim();
    // Un contenu qui n'est que les questions d'identification du besoin n'est
    // pas un déroulé : ce module n'est pas animable en l'état.
    const hasDeroule = content.length > 0 && normalize(content) !== normalize(questions);
    if (!hasDeroule) {
      ecartesSansDeroule += 1;
      continue;
    }
    const lib: LibraryModule = {
      moduleId: m.id, title: m.title, family: m.family, targetProfile: m.targetProfile,
      signals: [], needIdentification: m.needIdentification, isFoundation: m.isFoundation,
      durationMin: m.durationMin, excludedFromClientOutputs: false,
      source: {
        productId: p.id, code: p.code, title: p.title, theme: p.theme,
        fundingType: p.fundingType, isActive: p.isActive, supersededBy: null,
      },
    };
    units.push({
      kind: 'module',
      title: m.title,
      origin: `${p.title} (${p.code})`,
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

const douleurs: Douleur[] = listDiagnosticPainPoints().map((p) => {
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

interface Proposition {
  douleur: Douleur;
  candidats: { unit: RealUnit; score: number; mots: string[] }[];
}

const propositions: Proposition[] = douleurs.map((d) => {
  const scored = units
    .map((unit) => {
      const mots = d.terms.filter((t) => (weights.get(t) ?? 0) > 0 && unit.words.has(t));
      const score = mots.reduce((s, t) => s + (weights.get(t) ?? 0), 0);
      return { unit, score: Math.round(score * 100) / 100, mots };
    })
    // Un seul mot passe-partout ne fait pas une proposition. On exige soit DEUX
    // mots, soit un mot réellement rare (poids plein). Mieux vaut une douleur
    // déclarée non couverte — Laurent saura qu'il doit écrire — qu'une ligne
    // fausse qu'il devra prendre le temps de barrer.
    .filter(
      (c) =>
        c.mots.length >= 2 ||
        // Un seul mot ne suffit que s'il est à la fois RARE dans le catalogue
        // et substantiel — « exclusivite », « compromis », « prospection ».
        (c.score >= QUALIFIANT && c.mots.some((m) => m.length >= 8)),
    );

  // D-18 — on sert dans la première famille acceptée par le besoin.
  const served = d.families.find((f) => scored.some((c) => c.unit.family === f)) ?? null;
  const inFamily = served ? scored.filter((c) => c.unit.family === served) : [];

  return {
    douleur: d,
    candidats: inFamily.sort((a, b) => b.score - a.score).slice(0, 3),
  };
});

// Fréquence d'apparition : d'abord ce qui est demandé à TOUS les diagnostics,
// puis le poids que Laurent a lui-même donné à la règle dans son barème.
propositions.sort((a, b) => {
  if (a.douleur.aTous !== b.douleur.aTous) return a.douleur.aTous ? -1 : 1;
  return b.douleur.weight - a.douleur.weight || a.douleur.chapter - b.douleur.chapter;
});

const couvertes = propositions.filter((p) => p.candidats.length > 0);
const orphelines = propositions.filter((p) => p.candidats.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
// Le rapport
// ─────────────────────────────────────────────────────────────────────────────

const md: string[] = [
  '# À relire — quel module pour quelle douleur ?',
  '',
  `_Proposition générée le ${new Date().toISOString().slice(0, 10)} · tenant « ${tenant.name} ». **Rien n'a été écrit en base.**_`,
  '',
  '## Pourquoi cette liste',
  '',
  'Les étiquettes sont sur les mauvais modules. Ceux qui portent les **signaux diagnostic** n’ont ni titre client ni déroulé ; ceux du **Drive et de Faros** ont les deux, mais aucun signal. C’est pour ça qu’un parcours composé sort aujourd’hui avec « déroulé à compléter » partout.',
  '',
  'Cette liste propose, pour chaque douleur que le diagnostic sait détecter, **le ou les modules réels** qui pourraient y répondre. Tu relis, tu corriges, tu valides — **ensuite** on écrit le rattachement.',
  '',
  '## Comment la lire',
  '',
  '- **Ordre** : les douleurs posées à **tous** les diagnostics d’abord (questions du set léger), puis par le poids que tu as donné à la règle dans ton barème. Ce n’est pas l’ordre du catalogue, c’est l’ordre dans lequel ces douleurs tombent en rendez-vous.',
  '- **Ce qui est proposé** : uniquement des unités **animables** — un module qui a un vrai déroulé, ou un produit que tu vends déjà, pris comme un tout.',
  `- **Ce qui est écarté d’office** : ${ecartesSansDeroule} module(s) sans déroulé (on ne peut pas animer ce qui n’est pas écrit), ${ecartesPige} module(s) pige (interdits en sortie client), ${ecartesDoublon} module(s) de rayons en doublon d’un produit vendu (D-19 bis).`,
  '- **Famille** : une douleur métier appelle du métier. L’IA n’apparaît que si le besoin l’accepte, et après le métier (D-18).',
  '- **Correspondance** : les mots qui ont fait le rapprochement. Un rapprochement à un seul mot est une piste, pas une preuve.',
  '',
  '## En un coup d’œil',
  '',
  `- **${units.length} unités animables** au catalogue (${units.filter((u) => u.kind === 'module').length} modules, ${units.filter((u) => u.kind === 'produit').length} produits vendus)`,
  `- **${couvertes.length} douleurs sur ${propositions.length}** reçoivent au moins une proposition`,
  `- **${orphelines.length} douleurs ne reçoivent RIEN** — c’est là que tu devras écrire du contenu`,
  '',
  '---',
  '',
  '## Les douleurs couvertes',
  '',
  '| # | Douleur | Posée à | Proposition | D’où elle vient | Pourquoi |',
  '|---|---|---|---|---|---|',
];

let n = 0;
for (const p of couvertes) {
  n += 1;
  const first = p.candidats[0]!;
  md.push(
    `| ${n} | **${p.douleur.label}**<br><small>ch. ${p.douleur.chapter} — ${p.douleur.chapterTitle}</small> | ${p.douleur.aTous ? 'tous' : 'complet seulement'} | ${first.unit.title} | ${first.unit.origin}${first.unit.kind === 'produit' ? '' : ''} | ${first.mots.join(', ')} |`,
  );
  for (const c of p.candidats.slice(1)) {
    md.push(`| | _autre piste_ | | ${c.unit.title} | ${c.unit.origin} | ${c.mots.join(', ')} |`);
  }
}

md.push(
  '',
  '---',
  '',
  '## Les douleurs que RIEN ne couvre',
  '',
  `**${orphelines.length} douleurs** n’ont aucun module ni produit animable qui leur réponde. Aucun rapprochement n’a été inventé pour elles : c’est ici que du contenu reste à écrire.`,
  '',
  '| Douleur | Chapitre | Posée à | Famille attendue |',
  '|---|---|---|---|',
);
for (const p of orphelines) {
  md.push(
    `| ${p.douleur.label} | ${p.douleur.chapter} — ${p.douleur.chapterTitle} | ${p.douleur.aTous ? 'tous' : 'complet seulement'} | ${p.douleur.families.join(' puis ')} |`,
  );
}

md.push(
  '',
  '---',
  '',
  '## Ce qu’il se passe après ta relecture',
  '',
  '1. Tu corriges les lignes fausses et tu barres celles que tu ne veux pas.',
  '2. On écrit le rattachement : le module retenu reçoit le **signal** de sa douleur, et devient donc recommandable **avec** son déroulé.',
  '3. Le parcours composé cesse de sortir « déroulé à compléter », et son programme Qualiopi redevient remettable.',
  '',
);

const out = path.resolve(process.cwd(), '../../.planning/260911-rattachement-douleur-module.md');
writeFileSync(out, `${md.join('\n')}\n`, 'utf8');

console.log(`\n=== ${units.length} unités animables · ${couvertes.length}/${propositions.length} douleurs couvertes ===`);
console.log(`    écartés : ${ecartesSansDeroule} sans déroulé · ${ecartesPige} pige · ${ecartesDoublon} doublon`);
console.log(`    ${orphelines.length} douleurs sans aucune proposition\n`);
console.log(`    Liste à relire : ${path.relative(process.cwd(), out)}\n`);

await prisma.$disconnect();
