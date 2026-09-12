/**
 * Assemblage de la proposition depuis le diagnostic — fonctions pures.
 *
 * Le point important : la proposition part exactement du MÊME `AuditData` que
 * le rapport d'audit. Ni deuxième lecture des réponses, ni deuxième calcul de
 * scores, ni deuxième moteur de financement. C'est ce qui garantit qu'un
 * dirigeant qui lit son audit et sa proposition côte à côte y trouve les mêmes
 * chiffres — la divergence entre deux documents issus des mêmes données est le
 * défaut racine que la chaîne est censée supprimer.
 */

import type {
  FundingRow,
  ProposalPlanningRow,
  PricingCoverage,
  PricingPayer,
  ProposalAxis,
  ProposalContent,
  ProposalFunding,
  ProposalModule,
  ProposalPricing,
} from '@qualiof/shared';

import type { AuditData } from '@/lib/diagnostic-r1/templates/audit-data';
import type { FundingParticipantResult, FundingSynthesis } from '@/lib/financement/types';
import type { FundingRuleValues } from '@/lib/financement/types';

import { accord, plural } from './plural';
import { composeProgramme, type ComposeOutput, type ComposedBlock } from './composer';
import {
  recommendModules,
  type LibraryModule,
  type ModuleMatchOutput,
} from './module-matcher';
import { conventionedHoursPerHalfDay } from './pricing';
import {
  recommendProgrammes,
  type CatalogueEntry,
  type ProgrammeCandidate,
  type ProgrammeMatchOutput,
  type ProgrammeRecommendation,
} from './programme-matcher';

function euros(n: number): number {
  return Math.round(n * 100) / 100;
}

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Identifiants stables : deux générations du même contenu donnent le même id. */
function slugId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Le financement — le tableau qui signe (§9.1-5)
// ─────────────────────────────────────────────────────────────────────────────

export interface FundingBuildInput {
  funding: FundingSynthesis;
  rules: FundingRuleValues;
  agencyName: string;
  /** Effectif salarié DÉCLARÉ au chapitre 2 — pas le nombre de fiches saisies. */
  declaredEmployeeCount: number | null;
  /** Consommations déclarées sur l'exercice, par participant, en €. */
  consumedThisYear?: number;
}

/**
 * Le tableau « budget mobilisable ».
 *
 * Les montants BRUTS sont affichés en haut, la consommation déjà engagée en
 * déduction, et le total est le montant NET — celui que le moteur a calculé.
 * Montrer le brut puis la déduction, plutôt que le net seul, est ce qui rend
 * le tableau lisible en rendez-vous : le dirigeant voit ce à quoi il a droit,
 * puis ce qu'il a déjà consommé.
 */
export function buildFundingSection(input: FundingBuildInput): ProposalFunding {
  const { funding, rules } = input;
  const rows: FundingRow[] = [];
  const consumed = input.consumedThisYear ?? 0;

  if (funding.agefice.participantCount > 0) {
    rows.push({
      funder: 'AGEFICE',
      beneficiaries: `${plural(funding.agefice.participantCount, 'indépendant')} ${accord(funding.agefice.participantCount, 'éligible')} (production N-1 supérieure à ${eur.format(rules.AGEFICE_THRESHOLD_CA_N1)})`,
      basis: `${eur.format(rules.AGEFICE_ANNUAL_CAP)} par personne et par an (plafond annuel AGEFICE)`,
      amount: euros(funding.agefice.budget + consumed),
      isDeduction: false,
    });
  }

  // Aucun droit affiché sans bénéficiaire : « 0 salarié · 2 500 € mobilisables »
  // était la contradiction relevée sur le premier audit réel.
  if (funding.opcoEp.participantCount > 0) {
    if (funding.opcoEp.manualValidationRequired) {
      rows.push({
        funder: 'OPCO EP',
        beneficiaries: `${input.agencyName} — ${plural(funding.opcoEp.participantCount, 'salarié')}`,
        basis: "Plus de 50 salariés : enveloppe à valider avec l’opérateur",
        amount: 0,
        isDeduction: false,
      });
    } else {
      rows.push({
        funder: 'OPCO EP',
        beneficiaries: `${input.agencyName} — ${plural(funding.opcoEp.participantCount, 'salarié')}${
          input.declaredEmployeeCount !== null
            ? ` (effectif déclaré : ${input.declaredEmployeeCount})`
            : ''
        }`,
        basis: 'Forfait annuel entreprise',
        amount: euros(funding.opcoEp.envelope ?? 0),
        isDeduction: false,
      });
    }
  }

  rows.push({
    funder: 'Déduction',
    beneficiaries:
      consumed > 0
        ? 'Financements déjà engagés sur l’exercice en cours'
        : 'Aucun financement engagé déclaré sur l’exercice en cours',
    basis: '—',
    amount: euros(consumed),
    isDeduction: true,
  });

  const total = euros(
    rows.filter((r) => !r.isDeduction).reduce((s, r) => s + r.amount, 0) - consumed,
  );

  // Le dirigeant TNS sans attestation CFP : un potentiel, jamais un droit.
  const dirigeantSousReserve = funding.alerts.some(
    (a) => a.code === 'agefice_dirigeant_sous_reserve_cfp',
  );
  const potentialNote = dirigeantSousReserve
    ? `Potentiel complémentaire : l’enveloppe AGEFICE du dirigeant (jusqu’à ${eur.format(rules.AGEFICE_ANNUAL_CAP)}) pourra être intégrée dès réception de son attestation de contribution formation professionnelle, à demander à votre expert-comptable.`
    : '';

  return {
    rows,
    total,
    potentialNote,
    clientAlerts: funding.alerts.filter((a) => a.audience === 'client').map((a) => a.label),
    conventionedHoursPerParticipant: funding.conventionedHours,
    halfDays: funding.halfDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Les payeurs — l'unité de facturation (§8.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface PayerSeedInput {
  funding: FundingSynthesis;
  rules: FundingRuleValues;
  agencyName: string;
  organizationSiret?: string | null;
  organizationAddress?: string | null;
  /** Fiches équipe — le nom sert au DEVIS, jamais à la proposition (PII §5 L-10). */
  participants: readonly {
    id: string;
    displayName: string;
    statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
  }[];
  /**
   * Le volume RÉELLEMENT vendu, en demi-journées (lot I-2).
   *
   * Par défaut, c'est l'enveloppe que le moteur budget a dimensionnée — ce que
   * les droits du client pourraient financer. Depuis la composition, l'appelant
   * passe le volume **composé**, c'est-à-dire celui dont chaque demi-journée est
   * justifiée par un point de douleur tracé.
   *
   * La différence n'est pas cosmétique : facturer l'enveloppe alors que la
   * composition n'en justifie que la moitié, c'est exactement le « remplir pour
   * remplir » que §8.2 interdit, et c'est ce qu'un contrôle OPCO cherche. Le
   * surplus se dit au dirigeant (arbitrage humain affiché), il ne se facture
   * pas d'office.
   */
  halfDaysSold?: number;
}

/**
 * Les payeurs par défaut, déduits du régime de chaque fiche équipe.
 *
 * Un indépendant est son propre payeur : la subrogation AGEFICE se monte par
 * personne, donc un devis par personne. Les salariés relèvent de l'employeur —
 * une entreprise, un devis, un dossier OPCO EP. C'est la même règle que
 * `payer-rule.ts` applique déjà aux sessions ; ici elle se lit sur le statut
 * saisi en rendez-vous, avant que les personnes n'existent au CRM.
 */
export function seedPayers(input: PayerSeedInput): PricingPayer[] {
  const { funding, rules } = input;
  const unitPriceHt = euros(rules.HALF_DAY_ONSITE_HOURS * rules.PRICE_PER_HOUR_PER_PARTICIPANT);
  // Le volume composé quand il existe, l'enveloppe sinon — un parcours qui n'a
  // rien pu composer doit rester chiffrable à la main plutôt que de sortir à 0.
  const halfDays =
    input.halfDaysSold !== undefined && input.halfDaysSold > 0
      ? input.halfDaysSold
      : funding.halfDays;
  const byId = new Map<string, FundingParticipantResult>(funding.participants.map((p) => [p.id, p]));

  const payers: PricingPayer[] = [];

  const independants = input.participants.filter((p) => {
    const r = byId.get(p.id);
    return r && r.regime !== 'OPCO_EP' && p.statut !== 'SALARIE';
  });
  const salaries = input.participants.filter((p) => {
    const r = byId.get(p.id);
    return r && (r.regime === 'OPCO_EP' || p.statut === 'SALARIE');
  });

  const lineFor = (label: string) => [
    {
      id: 'ligne-1',
      description: label,
      halfDays,
      unitPriceHt,
    },
  ];

  for (const [index, p] of independants.entries()) {
    const result = byId.get(p.id);
    const coverages: PricingCoverage[] = [];
    if (result && result.coverage > 0) {
      coverages.push({
        funder: 'AGEFICE',
        label:
          result.budgetSource === 'cfp_verifiee'
            ? 'Droits vérifiés au dossier — dossier individuel'
            : `Plafond annuel ${eur.format(rules.AGEFICE_ANNUAL_CAP)} — dossier individuel, sous réserve de l’attestation CFP`,
        amount: result.coverage,
      });
    }
    payers.push({
      id: slugId('payeur-inde', index),
      kind: 'INDEPENDANT',
      name: p.displayName,
      siret: null,
      email: null,
      address: null,
      groupLabel: 'Indépendants — dossiers individuels AGEFICE (subrogation, zéro avance)',
      groupNote:
        'Chaque dossier est monté et déposé par nos soins. Aucune avance de trésorerie.',
      participantIds: [p.id],
      participantCount: 1,
      lines: lineFor(`Parcours de ${plural(halfDays, 'demi-journée')}, co-animé, sur site`),
      coverages,
    });
  }

  if (salaries.length > 0) {
    const coverage = euros(
      salaries.reduce((s, p) => s + (byId.get(p.id)?.coverage ?? 0), 0),
    );
    const coverages: PricingCoverage[] = [];
    if (coverage > 0) {
      coverages.push({
        funder: 'OPCO_EP',
        label: 'Enveloppe annuelle entreprise',
        amount: coverage,
      });
    }
    payers.push({
      id: 'payeur-entreprise',
      kind: 'ENTREPRISE',
      name: input.agencyName,
      siret: input.organizationSiret ?? null,
      email: null,
      address: input.organizationAddress ?? null,
      groupLabel: `${input.agencyName} — ${accord(salaries.length, 'salarié')} (devis entreprise, dossier OPCO EP)`,
      groupNote: 'Un dossier unique pour l’entreprise, monté et déposé par nos soins.',
      participantIds: salaries.map((p) => p.id),
      participantCount: salaries.length,
      lines: lineFor(`Parcours de ${plural(halfDays, 'demi-journée')}, co-animé, sur site`),
      coverages,
    });
  }

  return payers;
}

export function seedPricing(input: PayerSeedInput): ProposalPricing {
  return {
    payers: seedPayers(input),
    discount: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le contenu narratif (§9.1-2 à §9.1-8)
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentSeedInput {
  audit: AuditData;
  rules: FundingRuleValues;
  /** La bibliothèque de modules (lot I-2) — l'unité composable, cf. D-19. */
  library: readonly LibraryModule[];
  agencyName: string;
  /** DIAG-NNNN, cité dans « ce que nous avons entendu ». */
  diagnosticReference: string;
  meetingAt: Date | null;
  ofName: string;
  participantCount: number;
}

export interface ContentSeedOutput {
  content: ProposalContent;
  match: ModuleMatchOutput;
  composition: ComposeOutput;
}

/** Les mois d'un parcours, dans l'ordre, à partir du mois courant. */
function monthLabels(from: Date, count: number): string[] {
  const fmt = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + i + 1, 1);
    return fmt.format(d);
  });
}

/**
 * La mention légale — jamais retirable (§9.1-9).
 *
 * Elle dit deux choses qu'un dirigeant doit lire avant de signer : les montants
 * sont estimatifs tant que les financeurs n'ont pas accepté, et la proposition
 * a une date de péremption.
 */
export function buildLegalMention(args: {
  validityDays: number;
  ofName: string;
  numDA: string | null;
  siret: string | null;
}): string {
  return (
    'Montants estimatifs, sous réserve des droits réellement disponibles et de l’acceptation des dossiers par les financeurs (AGEFICE, OPCO EP) — les éventuels écarts seront ajustés d’un commun accord sur le périmètre du parcours. ' +
    `Proposition valable ${args.validityDays} jours. ` +
    `${args.ofName} — organisme de formation certifié Qualiopi` +
    (args.numDA ? ` · NDA ${args.numDA}` : '') +
    (args.siret ? ` · SIRET ${args.siret}` : '') +
    '. La certification qualité a été délivrée au titre de la catégorie d’action suivante : actions de formation.'
  );
}

/** Un programme retenu, et tous les constats auxquels il répond. */
export interface MergedRecommendation {
  candidate: ProgrammeCandidate;
  triggers: string[];
}

/**
 * UN programme = UN axe.
 *
 * Le même programme répond souvent à plusieurs besoins. Sur DIAG-0001,
 * « Booster vendeur » remontait à la fois sur la découverte vendeur et sur
 * l'exclusivité, et la proposition sortait avec DEUX axes identiques — défaut
 * vu en jouant le parcours, pas en relisant le code. On regroupe donc par
 * programme, et l'axe porte tous les constats auxquels il répond : c'est plus
 * honnête, et c'est plus convaincant qu'un axe qui n'en porterait qu'un.
 *
 * L'ordre des besoins est conservé — il suit la chaîne commerciale.
 */
export function mergeRecommendationsByProduct(
  recommendations: readonly ProgrammeRecommendation[],
): MergedRecommendation[] {
  const grouped = new Map<string, MergedRecommendation>();
  for (const r of recommendations) {
    const best = r.candidates[0];
    if (!best) continue;
    const existing = grouped.get(best.productId);
    if (existing) existing.triggers.push(r.trigger);
    else grouped.set(best.productId, { candidate: best, triggers: [r.trigger] });
  }
  return [...grouped.values()];
}

/**
 * L'accroche de couverture.
 *
 * La maquette met en titre ce que l'accompagnement va changer — « Structurer
 * la vente, sécuriser les compromis, équiper l'équipe » — pas le nom de
 * l'agence, qui est déjà juste en dessous. On la compose donc depuis les
 * priorités du GPS de l'audit : ce sont exactement les leviers que la
 * proposition vend, et ils viennent du diagnostic, pas d'un slogan.
 */
/**
 * Le planning, recomposé depuis les axes.
 *
 * Défaut vu sur PROP-0001 : retirer un axe laissait sa ligne de planning en
 * place, et la proposition annonçait une session pour un programme qui n'y
 * figurait plus. Les deux blocs décrivent le même parcours ; quand ils
 * divergent, c'est le parcours qui fait foi.
 *
 * Les dates déjà arrêtées sont conservées, dans l'ordre : le commercial ne
 * perd pas ce qu'il a saisi parce qu'il a changé un programme.
 */
export function rebuildPlanningFromAxes(
  axes: readonly ProposalAxis[],
  previous: readonly ProposalPlanningRow[],
  participantCount: number,
): ProposalPlanningRow[] {
  return axes.map((axe, index) => ({
    id: slugId('planning', index),
    dateLabel:
      previous[index]?.dateLabel ??
      (axe.periodLabel ? `À arrêter — ${axe.periodLabel}` : 'À arrêter ensemble'),
    sessionLabel: `${axe.label} — ${axe.title}`,
    participantsLabel:
      previous[index]?.participantsLabel || plural(participantCount, 'participant'),
  }));
}

/** Les lignes de planning qui ne correspondent plus à aucun axe. */
export function planningMismatches(
  axes: readonly ProposalAxis[],
  planning: readonly ProposalPlanningRow[],
): string[] {
  const attendus = new Set(axes.map((a) => `${a.label} — ${a.title}`));
  return planning.map((p) => p.sessionLabel).filter((label) => !attendus.has(label));
}

/**
 * Un BLOC de composition devient un axe de la proposition.
 *
 * Le choix de forme, et sa raison : **un axe = une demi-journée**, pas un
 * thème. Un thème n'a pas de durée — il s'étale sur un bloc et demi, et le
 * dirigeant n'a plus aucun moyen de vérifier que le parcours détaillé explique
 * le volume facturé. Une demi-journée, si : elle vaut 1, elle porte une date au
 * planning, et la somme des axes tombe exactement sur le volume vendu.
 *
 * Le titre, lui, reste thématique — il nomme les besoins servis par ce bloc.
 * C'est ce que le dirigeant lit ; le décompte, c'est ce qu'il peut vérifier.
 */
export function axisFromBlock(
  block: ComposedBlock,
  index: number,
  periodLabel: string,
): ProposalAxis {
  const besoins = [...new Set(block.modules.map((m) => m.need.label))];

  const modules: ProposalModule[] = block.modules.map((m) => ({
    moduleId: m.moduleId,
    title: m.title,
    sourceCode: m.source.code,
    sourceTitle: m.source.title,
    needLabel: m.need.label,
    durationMin: m.durationMin,
    quotes: m.evidence.flatMap((e) =>
      e.kind === 'alerte'
        ? e.answers.map((a) => `${a.label} : ${a.value}`)
        : [`${e.label} : ${e.value}`],
    ),
    signal: m.matchedSignals[0] ?? null,
    confidence: m.confidence,
  }));

  // Le « pourquoi » de l'axe : les constats du diagnostic, tels qu'ils ont été
  // formulés dans l'audit. Jamais une reformulation — le dirigeant doit
  // reconnaître ses propres mots d'un document à l'autre.
  const constats = [
    ...new Set(
      block.modules.flatMap((m) =>
        m.evidence.map((e) => (e.kind === 'alerte' ? e.label : `${e.label} : ${e.value}`)),
      ),
    ),
  ];

  return {
    id: slugId('axe', index),
    label: `Demi-journée ${block.index}`,
    title: besoins.join(' · ') || 'À composer',
    // Un bloc réunit des modules de plusieurs programmes : aucun produit unique
    // ne le représente. La traçabilité vit dans `modules`, pas dans un id qui
    // désignerait arbitrairement l'un des rayons.
    productId: null,
    productCode: null,
    description: '',
    why: constats.join(' ') || 'À justifier avant envoi.',
    halfDays: 1,
    periodLabel,
    matchSource: block.modules.every((m) => m.confidence === 'forte') ? 'signaux' : 'lexique',
    modules,
  };
}

export function buildCoverHeadline(priorityTitles: readonly string[]): string {
  const retenues = priorityTitles.filter((t) => t.trim().length > 0).slice(0, 3);
  if (retenues.length === 0) return 'Un parcours dimensionné sur vos droits à la formation';
  const [premier, ...suite] = retenues;
  return [premier!, ...suite.map((t) => t.charAt(0).toLowerCase() + t.slice(1))].join(', ');
}

export function seedContent(input: ContentSeedInput): ContentSeedOutput {
  const { audit, rules } = input;

  const match = recommendModules({
    chapterScores: audit.chapterScores.map((c) => ({
      chapter: c.chapter,
      score: c.score,
      breakdown: c.breakdown,
    })),
    alerts: audit.chapters.flatMap((c) => c.alerts),
    answers: audit.chapters.flatMap((c) => c.answers),
    library: input.library,
  });

  // La composition : des blocs de 8 h conventionnées, chaque module justifié
  // par une réponse du diagnostic (D-19, D-20). Le volume ne se déduit plus
  // d'une division du total par le nombre d'axes.
  const composition = composeProgramme({
    recommendations: match.recommendations,
    rules,
    envelopeHalfDays: audit.funding.halfDays,
  });

  // « Ce que nous avons entendu » : les constats du diagnostic, jamais du
  // générique. Chaque puce provient d'une alerte de ratio (donc d'une réponse
  // et d'un repère) ou d'un levier de financement.
  const heard = audit.chapters
    .flatMap((c) => c.alerts)
    .filter((a) => a.audience === 'client')
    .map((a) => a.label)
    .slice(0, 6);

  const fundingLever = audit.funding.alerts.find((a) => a.code === 'droits_sous_utilises');
  if (fundingLever) heard.push(fundingLever.label);

  const months = monthLabels(input.meetingAt ?? audit.generatedAt, 12);

  const axes: ProposalAxis[] = composition.blocks.map((block, index) =>
    axisFromBlock(block, index, months[index] ?? ''),
  );

  const planning = rebuildPlanningFromAxes(axes, [], input.participantCount);

  const indemnity = `de l’ordre de ${eur.format(rules.AGEFICE_INDEMNITY_MIN)} à ${eur.format(rules.AGEFICE_INDEMNITY_MAX)}`;

  const content: ProposalContent = {
    subtitle: buildCoverHeadline(audit.priorities.map((p) => p.title)),
    recipientLabel: '',
    contactLabel: '',
    heardIntro: input.meetingAt
      ? `À la suite de notre diagnostic du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(input.meetingAt)} (audit complet joint — ${input.diagnosticReference}), voici les enjeux identifiés :`
      : `À la suite de notre diagnostic (audit complet joint — ${input.diagnosticReference}), voici les enjeux identifiés :`,
    heard,
    axesIntro:
      'Un parcours sur mesure, dans vos locaux, co-animé par deux formateurs spécialisés immobilier, composé depuis notre catalogue de programmes métier et IA — chaque axe répond à une priorité de votre audit. Un point de douleur métier reçoit un programme métier : l’IA n’est jamais la réponse par défaut.',
    axes,
    planning,
    piecesDeadlineNote: `Pour sécuriser la première date, l’ensemble des pièces administratives doit être réuni au plus tard ${rules.AGEFICE_LEAD_DAYS_MIN} jours avant la première session. Le lien de pré-inscription transmis à votre équipe permet à chacun de déposer ses pièces en quelques minutes — nous relançons nous-mêmes les retardataires.`,
    keyPoints: [
      `Chaque indépendant formé perçoit en plus une indemnisation AGEFICE ${indemnity}.`,
      'La formation valide les heures obligatoires loi ALUR des professionnels de l’immobilier.',
      `${input.ofName} prend en charge 100 % du montage administratif (dossiers AGEFICE et OPCO EP, appels aux participants, lien de pré-inscription) — et vous n’avancez pas un euro de trésorerie.`,
      'Les droits non consommés au 31 décembre sont définitivement perdus.',
    ],
    nextSteps: [
      {
        id: 'etape-1',
        action: 'Valider la proposition (signature du devis entreprise + accord de principe des indépendants)',
        who: input.agencyName,
        when: 'À définir',
      },
      {
        id: 'etape-2',
        action: 'Transmettre le lien de pré-inscription à l’équipe (pièces : CNI, RIB, attestation CFP)',
        who: 'Ensemble',
        when: 'Cette semaine',
      },
      {
        id: 'etape-3',
        action: 'Vérifier chaque dossier, relancer, monter et déposer les dossiers AGEFICE / OPCO EP',
        who: input.ofName,
        when: `Au plus tard ${rules.AGEFICE_LEAD_DAYS_MIN} jours avant la première session`,
      },
      {
        id: 'etape-4',
        action: 'Première session, dans vos locaux',
        who: 'Ensemble',
        when: 'À arrêter',
      },
    ],
    legalMention: buildLegalMention({
      validityDays: rules.PROPOSAL_VALIDITY_DAYS,
      ofName: audit.of.name,
      numDA: audit.of.numDA,
      siret: audit.of.siret,
    }),
  };

  return { content, match, composition };
}

/** Les heures conventionnées du parcours — la valeur unique, exposée une fois. */
export function conventionedHoursOf(halfDays: number, rules: FundingRuleValues): number {
  return halfDays * conventionedHoursPerHalfDay(rules);
}
