/**
 * Le programme Qualiopi du produit COMPOSÉ (lot I-2, D-19) — fonction pure.
 *
 * D-19 dit que le programme composé « devient le produit vendu à ce client ».
 * Un produit vendu doit porter un programme Qualiopi complet : objectifs,
 * durée, prérequis, public, moyens, déroulé. Ce fichier le fabrique **à partir
 * des modules retenus**, sans rien inventer.
 *
 * ## Trois règles de fabrication
 *
 * 1. **`durationHours` porte les heures CONVENTIONNÉES** (D-25). C'est ce champ
 *    qui alimente `convention-template.ts` et `agefice-attendance-generator.ts` :
 *    la convention et l'attestation d'assiduité déclarent ce nombre. Les heures
 *    sur site s'affichent **à côté**, jamais à la place — un écran qui montre un
 *    nombre d'heures sans dire lequel il est finit par en faire signer un faux.
 *
 * 2. **Les objectifs dérivent des MODULES retenus, pas des programmes sources.**
 *    Un rayon déclare les objectifs de ses dix modules ; on n'en retient parfois
 *    qu'un. Recopier les dix promettrait neuf choses qu'on n'anime pas — un
 *    écart entre l'information préalable et la prestation réalisée, c'est-à-dire
 *    une réserve en audit.
 *
 * 3. **Le déroulé nomme le BESOIN, jamais les chiffres du client.** La
 *    justification détaillée — « votre exclusivité est à 25 % contre 30 %
 *    attendus » — vit dans la proposition, qui s'adresse au dirigeant. Le
 *    programme, lui, s'attache à la convention et part au financeur : il porte
 *    « Rentrer des mandats en exclusivité, au bon prix », ce qui suffit à
 *    montrer la cohérence besoin ↔ programme ↔ durée qu'un contrôle regarde,
 *    sans lui livrer les ratios commerciaux de l'agence.
 */

import type { FundingRuleValues } from '@/lib/financement/types';

import type { ComposeOutput, ComposedModule } from './composer';

/** Ce qu'un rayon source peut léguer au produit composé. */
export interface SourceProgrammeInfo {
  code: string;
  title: string;
  prerequisites: string | null;
  targetAudience: string | null;
  pedagogicalMethods: string | null;
  evaluationMethods: string | null;
  accessibility: string | null;
  trainerProfile: string | null;
  pedagogicalSupport: string | null;
  accessConditions: string | null;
}

/** Les valeurs de l'OF, quand aucune source ne dit rien. */
export type ProgrammeFallback = Omit<SourceProgrammeInfo, 'code' | 'title'>;

export interface ComposedProgrammeInput {
  composition: ComposeOutput;
  rules: FundingRuleValues;
  agencyName: string;
  /** DIAG-NNNN — cité dans le programme comme origine du besoin. */
  diagnosticReference: string;
  sources: readonly SourceProgrammeInfo[];
  fallback: ProgrammeFallback;
  /** Le contenu détaillé de chaque module, par `moduleId`. */
  moduleContent?: ReadonlyMap<string, string>;
  /**
   * Les questions d'identification du besoin, par `moduleId`.
   *
   * Elles servent à RECONNAÎTRE un module sans déroulé, pas à en écrire un.
   * L'import du catalogue diagnostic (lot A) a rangé ces questions dans
   * `contentMd`, faute de contenu pédagogique dans la source : sans ce
   * recoupement, le programme remis au financeur déclarerait que la formation
   * consiste à demander « à quelle fréquence les vendeurs reçoivent-ils un
   * compte rendu ? ». C'est un contenu de RENDEZ-VOUS, pas de formation.
   */
  moduleNeedIdentification?: ReadonlyMap<string, string>;
}

/** Pourquoi un module est là — la version longue, réservée à la proposition. */
export interface ModuleJustification {
  moduleId: string;
  moduleTitle: string;
  sourceCode: string;
  sourceTitle: string;
  needLabel: string;
  /** Les mots du client, tels qu'il les a dits. */
  quotes: string[];
  /** Le signal du catalogue qui a fait le rapprochement, s'il y en a un. */
  signal: string | null;
  confidence: 'forte' | 'faible';
}

export interface ComposedProgramme {
  title: string;
  /** Heures CONVENTIONNÉES — c'est ce qui va sur la convention (D-25). */
  durationHours: number;
  /** Heures SUR SITE — affichées à côté, jamais à la place. */
  onSiteHours: number;
  halfDays: number;
  objectives: string[];
  prerequisites: string | null;
  targetAudience: string | null;
  pedagogicalMethods: string | null;
  evaluationMethods: string | null;
  accessibility: string | null;
  trainerProfile: string | null;
  pedagogicalSupport: string | null;
  accessConditions: string | null;
  programMd: string;
  /** La traçabilité, module par module — pour la proposition et l'écran. */
  justifications: ModuleJustification[];
  warnings: string[];
}

/** Sans accents ni casse — pour dédoublonner des textes saisis à la main. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Les verbes qui ouvrent un titre de module dans CE catalogue.
 *
 * Liste blanche, et c'est délibéré. La terminaison ne suffit pas : dans le
 * corpus réel, « Atelier », « Dossier », « Levier » et « Offre » finissent
 * comme des infinitifs sans en être, et « Atelier pratique » sortait en
 * objectif tel quel — du français cassé sur un document Qualiopi.
 *
 * Une liste NOIRE aurait le mauvais mode d'échec : le mot qu'on oublie produit
 * une phrase fautive. Une liste blanche a le bon : le verbe qu'on oublie
 * produit « Maîtriser « … » », qui est plus lourd mais correct. Entre lourd et
 * faux, sur une pièce qui part au financeur, le choix se fait tout seul.
 *
 * Elle est relevée sur les intitulés réellement présents en base, pas devinée.
 */
const TITLE_VERBS: ReadonlySet<string> = new Set([
  'acquerir', 'adapter', 'analyser', 'animer', 'apprendre', 'argumenter',
  'automatiser', 'batir', 'capter', 'choisir', 'comprendre', 'conclure',
  'construire', 'convaincre', 'creer', 'decouvrir', 'definir', 'deployer',
  'developper', 'diffuser', 'entrainer', 'etablir', 'evaluer', 'exploiter',
  'faire', 'fideliser', 'formaliser', 'generer', 'gerer', 'identifier',
  'integrer', 'maitriser', 'mesurer', 'mettre', 'motiver', 'negocier',
  'optimiser', 'organiser', 'piloter', 'planifier', 'pratiquer', 'preparer',
  'presenter', 'prospecter', 'qualifier', 'realiser', 'recruter', 'rediger',
  'relancer', 'renforcer', 'rentrer', 'ritualiser', 'savoir', 'securiser',
  'signer', 'simuler', 'structurer', 'suivre', 'synthetiser', 'traiter',
  'transformer', 'utiliser', 'valoriser', 'vendre',
]);

/**
 * Un titre de module devient-il un objectif tel quel ?
 *
 * Il se lit après « le stagiaire sera capable de » — donc il doit commencer par
 * un verbe à l'infinitif. Les groupes nominaux (« Suivi acheteur », « Atelier
 * pratique ») sont enveloppés pour que la phrase tienne debout.
 *
 * On n'enveloppe PAS en silence : chaque titre enveloppé remonte en
 * avertissement, parce qu'un titre de module qui ne se lit pas comme un
 * objectif est un titre à réécrire au catalogue, pas un problème de rendu.
 */
function looksLikeInfinitive(title: string): boolean {
  const first = norm(title).split(' ')[0] ?? '';
  return TITLE_VERBS.has(first);
}

function toObjective(title: string): { text: string; wrapped: boolean } {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (looksLikeInfinitive(clean)) {
    return { text: clean.charAt(0).toLowerCase() + clean.slice(1), wrapped: false };
  }
  return { text: `maîtriser « ${clean} »`, wrapped: true };
}

/** La première valeur non vide parmi les sources, puis le repli de l'OF. */
function inherit(
  sources: readonly SourceProgrammeInfo[],
  key: keyof ProgrammeFallback,
  fallback: ProgrammeFallback,
): string | null {
  for (const s of sources) {
    const v = s[key];
    if (v && v.trim().length > 0) return v.trim();
  }
  return fallback[key];
}

/**
 * Les prérequis : l'UNION des sources, dédoublonnée.
 *
 * On ne prend pas « le premier » comme pour les moyens pédagogiques : un
 * prérequis oublié, c'est un stagiaire qui suit une formation qu'il ne peut pas
 * suivre. Quand plusieurs sources en déclarent, on les cumule — c'est le sens
 * d'un parcours composé.
 */
function mergePrerequisites(
  sources: readonly SourceProgrammeInfo[],
  fallback: ProgrammeFallback,
): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    const v = s.prerequisites?.trim();
    if (!v) continue;
    // « Aucune » / « Aucun prérequis » ne s'additionne à rien.
    if (/^aucun/i.test(norm(v))) continue;
    if (seen.has(norm(v))) continue;
    seen.add(norm(v));
    out.push(v);
  }
  if (out.length === 0) return fallback.prerequisites ?? 'Aucun prérequis.';
  return out.join(' ');
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1).replace('.', ',')} h`;
}

export function buildComposedProgramme(input: ComposedProgrammeInput): ComposedProgramme {
  const { composition, rules } = input;
  const warnings: string[] = [];
  const content = input.moduleContent ?? new Map<string, string>();
  const needQuestions = input.moduleNeedIdentification ?? new Map<string, string>();
  const sansDeroule: string[] = [];

  const modules: ComposedModule[] = composition.blocks.flatMap((b) => b.modules);
  const usedCodes = new Set(modules.map((m) => m.source.code));
  const sources = input.sources.filter((s) => usedCodes.has(s.code));

  // ── Objectifs — un par module retenu, dans l'ordre du déroulé ──────────────
  const objectives: string[] = [];
  const seenObjective = new Set<string>();
  let wrappedCount = 0;
  for (const m of modules) {
    const { text, wrapped } = toObjective(m.title);
    if (seenObjective.has(norm(text))) continue;
    seenObjective.add(norm(text));
    objectives.push(text.charAt(0).toUpperCase() + text.slice(1));
    if (wrapped) wrappedCount += 1;
  }
  if (wrappedCount > 0) {
    warnings.push(
      `${wrappedCount} objectif(s) ont dû être reformulés : le titre du module n'est pas un infinitif et ne se lit pas après « le stagiaire sera capable de ». À reprendre au catalogue plutôt qu'à la main sur chaque proposition.`,
    );
  }
  if (objectives.length === 0) {
    warnings.push('Aucun module retenu : le programme est vide et ne peut pas être vendu.');
  }

  // ── La traçabilité, en version longue ──────────────────────────────────────
  const justifications: ModuleJustification[] = modules.map((m) => ({
    moduleId: m.moduleId,
    moduleTitle: m.title,
    sourceCode: m.source.code,
    sourceTitle: m.source.title,
    needLabel: m.need.label,
    quotes: m.evidence.flatMap((e) =>
      e.kind === 'alerte'
        ? e.answers.map((a) => `${a.label} : ${a.value}`)
        : [`${e.label} : ${e.value}`],
    ),
    signal: m.matchedSignals[0] ?? null,
    confidence: m.confidence,
  }));

  const faibles = justifications.filter((j) => j.confidence === 'faible');
  if (faibles.length > 0) {
    warnings.push(
      `${faibles.length} module(s) reposent sur un rapprochement par les mots de leur intitulé, pas sur un signal du catalogue. À relire avant d'envoyer.`,
    );
  }

  // ── Le déroulé ─────────────────────────────────────────────────────────────
  const title = `Parcours sur mesure — ${input.agencyName}`;
  const onSite = formatHours(composition.totalOnSiteHours);
  const conventioned = formatHours(composition.totalConventionedHours);

  const md: string[] = [
    `# ${title}`,
    '',
    `Parcours composé à partir du diagnostic **${input.diagnosticReference}**, en ${composition.totalHalfDays} demi-journée(s) sur site.`,
    '',
    `**Durée : ${conventioned} conventionnées** (${onSite} sur site, co-animation ${rules.TRAINER_COUNT_DEFAULT} formateur(s)).`,
    '',
    '## Objectifs pédagogiques',
    '',
    'À l’issue de la formation, le stagiaire sera capable de :',
    '',
    ...objectives.map((o) => `- ${o}`),
    '',
    '## Déroulé',
    '',
  ];

  for (const block of composition.blocks) {
    md.push(
      `### Demi-journée ${block.index} — ${formatHours(rules.HALF_DAY_ONSITE_HOURS)} sur site (${formatHours(block.conventionedHours)} conventionnées)`,
      '',
    );
    for (const m of block.modules) {
      md.push(`#### ${m.title}`, '');
      // Le BESOIN, pas les chiffres du client : ce document part au financeur.
      md.push(`_Répond au besoin : ${m.need.label}._`, '');
      // Un contenu qui n'est que les questions d'identification du besoin n'est
      // PAS un déroulé : on ne l'imprime pas, on signale le trou.
      const raw = content.get(m.moduleId)?.trim() ?? '';
      const questions = needQuestions.get(m.moduleId)?.trim() ?? '';
      const body = raw.length > 0 && (questions.length === 0 || norm(raw) !== norm(questions))
        ? raw
        : '';
      if (body) {
        md.push(body, '');
      } else {
        sansDeroule.push(m.title);
        md.push('_Déroulé détaillé à compléter au catalogue._', '');
      }
      md.push(`_Source : ${m.source.title} (${m.source.code})._`, '');
    }
  }

  md.push(
    '## Public visé',
    '',
    inherit(sources, 'targetAudience', input.fallback) ??
      'Conseillers immobiliers et responsables d’agence.',
    '',
    '## Prérequis',
    '',
    mergePrerequisites(sources, input.fallback) ?? 'Aucun prérequis.',
    '',
    '## Moyens pédagogiques et techniques',
    '',
    inherit(sources, 'pedagogicalMethods', input.fallback) ?? '',
    '',
    '## Modalités d’évaluation',
    '',
    inherit(sources, 'evaluationMethods', input.fallback) ?? '',
    '',
    '## Accessibilité aux personnes en situation de handicap',
    '',
    inherit(sources, 'accessibility', input.fallback) ?? '',
    '',
  );

  if (sansDeroule.length > 0) {
    warnings.push(
      `${sansDeroule.length} module(s) n'ont AUCUN déroulé pédagogique au catalogue (${sansDeroule
        .slice(0, 3)
        .join(', ')}). Le programme ne les invente pas — il laisse la place vide. À écrire avant d'émettre la convention : un financeur qui lit « à quelle fréquence… ? » y verrait un rendez-vous commercial, pas une formation.`,
    );
  }

  for (const key of ['pedagogicalMethods', 'evaluationMethods', 'accessibility'] as const) {
    if (!inherit(sources, key, input.fallback)) {
      warnings.push(
        `Rubrique Qualiopi vide : « ${key} ». Aucun programme source ne la renseigne et l'organisme n'a pas de valeur par défaut — à compléter avant d'émettre la convention.`,
      );
    }
  }

  return {
    title,
    // D-25 — les heures CONVENTIONNÉES, et rien d'autre, dans ce champ.
    durationHours: composition.totalConventionedHours,
    onSiteHours: composition.totalOnSiteHours,
    halfDays: composition.totalHalfDays,
    objectives,
    prerequisites: mergePrerequisites(sources, input.fallback),
    targetAudience: inherit(sources, 'targetAudience', input.fallback),
    pedagogicalMethods: inherit(sources, 'pedagogicalMethods', input.fallback),
    evaluationMethods: inherit(sources, 'evaluationMethods', input.fallback),
    accessibility: inherit(sources, 'accessibility', input.fallback),
    trainerProfile: inherit(sources, 'trainerProfile', input.fallback),
    pedagogicalSupport: inherit(sources, 'pedagogicalSupport', input.fallback),
    accessConditions: inherit(sources, 'accessConditions', input.fallback),
    programMd: md.join('\n'),
    justifications,
    warnings,
  };
}
