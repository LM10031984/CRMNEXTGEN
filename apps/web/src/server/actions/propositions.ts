'use server';

/**
 * Server actions de la proposition commerciale (lot E de la chaîne diagnostic).
 *
 * Check-list appliquée à chaque action (convention `/quick`) : requireRole ·
 * scope tenantId sur TOUTES les requêtes, y compris les findFirst de contrôle ·
 * Zod avant tout I/O · AuditLog dans la même transaction que l'écriture ·
 * revalidatePath sur toutes les pages qui lisent · retour `{ ok }` discriminé,
 * jamais de throw pour une erreur métier · Decimal comparé via Number().
 *
 * Trois portes verrouillées avant l'envoi, et elles ne s'ouvrent pas seules :
 *   1. la relecture humaine (`reviewedAt`) — l'IA rédige, un humain valide ;
 *   2. la validation d'une remise au-delà du seuil, par un MANAGER/ADMIN ;
 *   3. un PDF à jour — pas un document périmé qui traîne depuis trois jours.
 */

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import {
  ProposalContentSchema,
  ProposalPricingSchema,
  PricingDiscountSchema,
} from '@qualiof/shared';
import { REFERENTIAL_VERSION } from '@qualiof/shared/diagnostic';
import type { ProposalContent, ProposalPricing } from '@qualiof/shared';

import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { loadOfConfig } from '@/lib/of-config';
import { loadFundingRules } from '@/lib/financement/load-rules';
import type { FundingRuleValues } from '@/lib/financement/types';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { buildAuditData } from '@/lib/diagnostic-r1/audit-builder';
import { SCORING_VERSION } from '@/lib/diagnostic-r1/scoring';
import { resolveEmployeeCount } from '@/lib/diagnostic-r1/snapshot';
import type { FingerprintInput } from '@/lib/diagnostic-r1/fingerprint';
import {
  computePricing,
  isRoundingGap,
  ROUNDING_DISCOUNT_REASON,
  type PricingSynthesis,
} from '@/lib/proposition/pricing';
import { buildQuoteDrafts, quotesMatchProposal } from '@/lib/proposition/quotes';
import {
  buildFundingSection,
  planningMismatches,
  seedContent,
  seedPricing,
} from '@/lib/proposition/builder';
import {
  recommendProgrammes,
  type CatalogueEntry,
} from '@/lib/proposition/programme-matcher';
import {
  compareSourceFingerprint,
  computeProposalFingerprint,
  type FingerprintComparison,
} from '@/lib/proposition/fingerprint';
import { hashPublicToken, PUBLIC_TOKEN_BYTES } from '@/lib/proposition/public-link';
import { renderPropositionHtml } from '@/lib/proposition/templates/proposition-template';
import type { PropositionData } from '@/lib/proposition/templates/proposition-data';

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const;
const READ_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'LECTEUR'] as const;
/** D-3 : MANAGER suffit à valider une remise. */
const DISCOUNT_APPROVAL_ROLES = ['ADMIN', 'MANAGER'] as const;

/** Valeur de l'audit affichée en couverture — paramètre nommé, pas noyé. */
const AUDIT_VALUE_EUROS = 3000;

async function guard(roles: readonly string[] = WRITE_ROLES) {
  try {
    return { ok: true as const, user: await requireRole([...roles] as never) };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false as const, error: e.message };
    }
    throw e;
  }
}

function revalidateProposal(id: string, diagnosticId?: string) {
  revalidatePath('/app/propositions');
  revalidatePath(`/app/propositions/${id}`);
  if (diagnosticId) revalidatePath(`/app/diagnostics/${diagnosticId}`);
  revalidatePath('/app/devis');
}

/** Référence PROP-NNNN — même mécanique que DEV-NNNN et DIAG-NNNN. */
async function generateProposalReference(tenantId: string): Promise<string> {
  const existing = await prisma.proposal.findMany({
    where: { tenantId, reference: { startsWith: 'PROP-' } },
    select: { reference: true },
  });
  const maxSeq = existing.reduce((m, p) => {
    const match = p.reference.match(/^PROP-0*(\d+)$/);
    if (!match || !match[1]) return m;
    return Math.max(m, parseInt(match[1], 10));
  }, 0);
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = `PROP-${String(maxSeq + attempt).padStart(4, '0')}`;
    const clash = await prisma.proposal.findFirst({
      where: { tenantId, reference: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('Impossible de générer une référence de proposition unique (50 collisions).');
}

/** DEV-NNNN — repris du module Devis pour que les deux compteurs cohabitent. */
async function generateQuoteNumber(
  tenantId: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const candidates = await tx.quote.findMany({
    where: { tenantId, number: { startsWith: 'DEV-' } },
    select: { number: true },
  });
  const maxSeq = candidates.reduce((m, q) => {
    const match = q.number.match(/^DEV-0*(\d+)$/);
    if (!match || !match[1]) return m;
    return Math.max(m, parseInt(match[1], 10));
  }, 0);
  return `DEV-${String(maxSeq + 1).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chargement et assemblage — un seul chemin, pour que tout parte des mêmes
// données que le rapport d'audit
// ─────────────────────────────────────────────────────────────────────────────

async function loadDiagnosticBundle(diagnosticId: string, tenantId: string) {
  return prisma.diagnostic.findFirst({
    where: { id: diagnosticId, tenantId },
    select: {
      id: true,
      reference: true,
      variant: true,
      referentialVersion: true,
      meetingAt: true,
      leadId: true,
      organizationId: true,
      organization: { select: { legalName: true, siret: true } },
      lead: { select: { firstName: true, lastName: true, notes: true, email: true } },
      answers: { select: { questionId: true, value: true, isSkipped: true } },
      participants: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          statut: true,
          fonction: true,
          caN1: true,
          objectiveCa: true,
          strengths: true,
          priorityNeed: true,
          opcoEligible: true,
          trainings24mFunded: true,
          includedInProposal: true,
        },
      },
    },
  });
}

type DiagnosticBundle = NonNullable<Awaited<ReturnType<typeof loadDiagnosticBundle>>>;

function agencyNameOf(d: DiagnosticBundle): string {
  return (
    d.organization?.legalName ??
    d.lead.notes?.replace(/^Agence\s*:\s*/, '').trim() ??
    [d.lead.firstName, d.lead.lastName].filter(Boolean).join(' ') ??
    d.reference
  );
}

/**
 * Le catalogue vu par le moteur de recommandation.
 *
 * Les modules interdits en sortie client (la pige) sont retirés AVANT que
 * leurs signaux n'entrent dans le calcul : un module exclu ne doit ni être
 * proposé, ni influencer ce qui l'est.
 */
async function loadCatalogue(tenantId: string): Promise<CatalogueEntry[]> {
  const products = await prisma.trainingProduct.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      title: true,
      theme: true,
      isActive: true,
      fundingType: true,
      durationHours: true,
      modules: {
        select: { diagnosticSignals: true, excludedFromClientOutputs: true },
      },
    },
  });

  return products.map((p) => {
    const allowed = p.modules.filter((m) => !m.excludedFromClientOutputs);
    const signals = allowed.flatMap((m) =>
      Array.isArray(m.diagnosticSignals) ? (m.diagnosticSignals as unknown[]).map(String) : [],
    );
    return {
      productId: p.id,
      code: p.code,
      title: p.title,
      theme: p.theme,
      isActive: p.isActive,
      fundingType: p.fundingType,
      durationHours: p.durationHours,
      signals,
      hasExcludedModule: p.modules.some((m) => m.excludedFromClientOutputs),
    };
  });
}

function fingerprintInputOf(
  bundle: DiagnosticBundle,
  rules: Awaited<ReturnType<typeof loadFundingRules>>['values'],
): FingerprintInput {
  return {
    answers: bundle.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      isSkipped: a.isSkipped,
    })),
    participants: bundle.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      statut: p.statut,
      caN1: p.caN1 === null ? null : Number(p.caN1),
      objectiveCa: p.objectiveCa === null ? null : Number(p.objectiveCa),
      strengths: p.strengths,
      includedInProposal: p.includedInProposal,
    })),
    rules,
    scoringVersion: SCORING_VERSION,
    referentialVersion: bundle.referentialVersion || REFERENTIAL_VERSION,
  };
}

/** Le diagnostic, ses moteurs et son catalogue — la matière de la proposition. */
async function assembleFromDiagnostic(diagnosticId: string, tenantId: string) {
  const bundle = await loadDiagnosticBundle(diagnosticId, tenantId);
  if (!bundle) return null;

  const [{ values: rules }, of, catalogue] = await Promise.all([
    loadFundingRules(tenantId),
    loadOfConfig(tenantId),
    loadCatalogue(tenantId),
  ]);

  const participants = bundle.participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    statut: p.statut,
    caN1: p.caN1 === null ? null : Number(p.caN1),
    objectiveCa: p.objectiveCa === null ? null : Number(p.objectiveCa),
    strengths: p.strengths,
    priorityNeed: p.priorityNeed,
    opcoEligible: p.opcoEligible,
    trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded),
    includedInProposal: p.includedInProposal,
  }));

  const audit = buildAuditData({
    reference: bundle.reference,
    agencyName: agencyNameOf(bundle),
    generatedAt: new Date(),
    variant: bundle.variant,
    answers: bundle.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      isSkipped: a.isSkipped,
    })),
    participants,
    rules,
    of: {
      name: of.name,
      siret: of.siret || null,
      numDA: of.rnq || null,
      address: of.addressFull || null,
      email: of.email || null,
      phone: of.phone || null,
    },
    valueEuros: AUDIT_VALUE_EUROS,
  });

  return { bundle, rules, of, catalogue, audit, participants };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Créer la proposition depuis un diagnostic
// ─────────────────────────────────────────────────────────────────────────────

export async function createProposalFromDiagnostic(
  diagnosticId: string,
): Promise<ActionResult<{ proposalId: string; reference: string; notices: string[] }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { user } = g;

  const assembled = await assembleFromDiagnostic(diagnosticId, user.tenantId);
  if (!assembled) return { ok: false, error: 'Diagnostic introuvable' };
  const { bundle, rules, of, catalogue, audit, participants } = assembled;

  if (bundle.answers.length === 0) {
    return {
      ok: false,
      error: "Ce diagnostic ne porte aucune réponse : il n'y a rien sur quoi appuyer une proposition.",
    };
  }
  if (participants.filter((p) => p.includedInProposal).length === 0) {
    return {
      ok: false,
      error:
        "Aucune fiche équipe retenue : sans participant, ni le volume ni le financement ne peuvent être dimensionnés.",
    };
  }

  const agencyName = agencyNameOf(bundle);
  const { content, match } = seedContent({
    audit,
    rules,
    catalogue,
    agencyName,
    diagnosticReference: bundle.reference,
    meetingAt: bundle.meetingAt,
    ofName: of.name,
    participantCount: participants.filter((p) => p.includedInProposal).length,
  });

  const pricing = seedPricing({
    funding: audit.funding,
    rules,
    agencyName,
    organizationSiret: bundle.organization?.siret ?? null,
    organizationAddress: null,
    participants: participants
      .filter((p) => p.includedInProposal)
      .map((p) => ({ id: p.id, displayName: p.displayName, statut: p.statut })),
  });

  const funding = buildFundingSection({
    funding: audit.funding,
    rules,
    agencyName,
    declaredEmployeeCount: audit.declaredEmployeeCount,
  });

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + rules.PROPOSAL_VALIDITY_DAYS);

  const reference = await generateProposalReference(user.tenantId);
  const fingerprint = computeProposalFingerprint({
    diagnostic: fingerprintInputOf(bundle, rules),
    pricing,
    content,
    validUntil,
  });

  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        tenantId: user.tenantId,
        reference,
        diagnosticId: bundle.id,
        leadId: bundle.leadId,
        organizationId: bundle.organizationId,
        ownerUserId: user.id,
        status: 'BROUILLON',
        title: `Proposition d'accompagnement — ${agencyName}`,
        validUntil,
        contentJson: content as unknown as Prisma.InputJsonValue,
        pricingJson: pricing as unknown as Prisma.InputJsonValue,
        fundingJson: funding as unknown as Prisma.InputJsonValue,
        // E-3 : la rédaction est heuristique tant qu'aucun modèle n'est
        // branché. On l'écrit, on ne le laisse pas deviner.
        generationSource: 'heuristique',
        sourceFingerprint: fingerprint,
      },
      select: { id: true, reference: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'Proposal',
        entityId: created.id,
        action: 'proposition.created',
        diff: {
          diagnosticId: bundle.id,
          reference: created.reference,
          axes: content.axes.length,
          payers: pricing.payers.length,
          halfDays: audit.funding.halfDays,
          conventionedHours: audit.funding.conventionedHours,
          notices: match.notices,
        } as Prisma.InputJsonValue,
      },
    });

    return created;
  });

  revalidateProposal(proposal.id, bundle.id);
  return {
    ok: true,
    data: { proposalId: proposal.id, reference: proposal.reference, notices: match.notices },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Lire une proposition, avec ses chiffres recalculés
// ─────────────────────────────────────────────────────────────────────────────

async function loadProposal(proposalId: string, tenantId: string) {
  return prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    select: {
      id: true,
      reference: true,
      status: true,
      title: true,
      version: true,
      validUntil: true,
      contentJson: true,
      pricingJson: true,
      fundingJson: true,
      generationSource: true,
      reviewedAt: true,
      sentAt: true,
      acceptedAt: true,
      declinedAt: true,
      discountApprovedAt: true,
      discountApprovedById: true,
      publicTokenHash: true,
      publicTokenExpiresAt: true,
      pdfKey: true,
      sourceFingerprint: true,
      updatedAt: true,
      diagnosticId: true,
      ownerUserId: true,
      owner: { select: { firstName: true, lastName: true, email: true } },
      quotes: { select: { id: true, number: true, amountHT: true } },
    },
  });
}

export type LoadedProposal = NonNullable<Awaited<ReturnType<typeof loadProposal>>>;

/**
 * Ce que l'écran et le PDF doivent afficher : le contenu stocké, mais les
 * montants RECALCULÉS. Un total persisté finit toujours par diverger de ses
 * lignes ; ici il n'existe pas.
 */
export interface ProposalWorkspace {
  proposal: LoadedProposal;
  content: ProposalContent;
  pricing: ProposalPricing;
  synthesis: PricingSynthesis;
  data: PropositionData;
  freshness: FingerprintComparison;
  /** Ce qui bloque l'envoi, en clair. Vide = on peut envoyer. */
  blockers: string[];
  /**
   * Ce qui n'empêche pas d'envoyer mais qui se voit dans le document — une
   * incohérence entre ce qu'on vend et ce qu'on détaille, typiquement.
   */
  warnings: string[];
  roundingOffer: { amount: number } | null;
  /** Les règles de financement, pour que l'écran calcule comme le PDF. */
  rules: FundingRuleValues;
  /**
   * Ce que le catalogue permet — et ce qu'il ne permet pas. Un besoin métier
   * que le catalogue actif ne couvre pas se DIT au commercial : c'est un
   * manque de catalogue, pas une raison de vendre autre chose.
   */
  catalogueNotices: string[];
}

async function buildWorkspace(
  proposalId: string,
  tenantId: string,
): Promise<ProposalWorkspace | null> {
  const proposal = await loadProposal(proposalId, tenantId);
  if (!proposal) return null;

  const assembled = await assembleFromDiagnostic(proposal.diagnosticId, tenantId);
  if (!assembled) return null;
  const { bundle, rules, of, audit, catalogue } = assembled;

  const content = ProposalContentSchema.parse(proposal.contentJson);
  const pricing = ProposalPricingSchema.parse(proposal.pricingJson);
  const synthesis = computePricing({ pricing, rules });

  const funding = buildFundingSection({
    funding: audit.funding,
    rules,
    agencyName: agencyNameOf(bundle),
    declaredEmployeeCount: audit.declaredEmployeeCount,
  });

  const currentFingerprint = computeProposalFingerprint({
    diagnostic: fingerprintInputOf(bundle, rules),
    pricing,
    content,
    validUntil: proposal.validUntil,
  });

  const ownerLabel = [proposal.owner.firstName, proposal.owner.lastName]
    .filter(Boolean)
    .join(' ');

  const data: PropositionData = {
    reference: proposal.reference,
    version: proposal.version,
    agencyName: agencyNameOf(bundle),
    generatedAt: new Date(),
    validUntil: proposal.validUntil,
    ownerLabel,
    of: {
      name: of.name,
      siret: of.siret || null,
      numDA: of.rnq || null,
      address: of.addressFull || null,
      email: of.email || null,
      phone: of.phone || null,
    },
    content,
    onsiteHoursPerHalfDay: rules.HALF_DAY_ONSITE_HOURS,
    trainerCount: rules.TRAINER_COUNT_DEFAULT,
    pricing: synthesis,

    funding,
    auditReference: bundle.reference,
    quoteNumbers: proposal.quotes.map((q) => q.number),
    generationSource: proposal.generationSource,
  };

  const blockers: string[] = [];
  if (!proposal.reviewedAt) {
    blockers.push(
      'La proposition n’a pas été relue. Un document rédigé par heuristique ou par IA ne part jamais sans relecture humaine.',
    );
  }
  if (synthesis.discountRequiresApproval && !proposal.discountApprovedAt) {
    blockers.push(
      `La remise dépasse ${rules.DISCOUNT_WARNING_PERCENT} % du reste à charge : elle doit être validée par un responsable avant l’envoi.`,
    );
  }
  if (!proposal.pdfKey) {
    blockers.push('Aucun PDF généré : il n’y a rien à envoyer.');
  }
  if (
    compareSourceFingerprint(proposal.sourceFingerprint, currentFingerprint) === 'stale' &&
    proposal.pdfKey
  ) {
    blockers.push(
      'Le PDF ne correspond plus aux données : régénérez-le avant de l’envoyer.',
    );
  }
  for (const a of synthesis.alerts.filter((x) => x.severity === 'blocking')) {
    if (a.code !== 'remise_validation_requise') blockers.push(a.label);
  }

  // Le parcours détaillé doit expliquer le volume vendu. Une proposition qui
  // facture 9 demi-journées et n'en détaille que 6 laisse le dirigeant compter
  // tout seul — et c'est exactement le genre d'écart silencieux que la chaîne
  // existe pour supprimer.
  const warnings: string[] = [];
  const axesHalfDays = content.axes.reduce((sum, a) => sum + a.halfDays, 0);
  if (content.axes.length > 0 && axesHalfDays !== synthesis.halfDaysMax) {
    warnings.push(
      `Le parcours détaille ${axesHalfDays} demi-journées alors que le chiffrage en vend ${synthesis.halfDaysMax}. Le dirigeant verra l’écart : ajustez les axes ou le chiffrage.`,
    );
  }

  // Le planning et les axes décrivent le même parcours. Quand ils divergent —
  // typiquement après le retrait d'un axe — la proposition annonce une session
  // pour un programme qui n'y figure plus.
  const orphelines = planningMismatches(content.axes, content.planning);
  if (orphelines.length > 0) {
    warnings.push(
      `Le planning annonce ${orphelines.length === 1 ? 'une session qui ne correspond' : `${orphelines.length} sessions qui ne correspondent`} à aucun axe (${orphelines.join(' · ')}). Recomposez-le depuis les axes.`,
    );
  }

  const roundingOffer =
    !synthesis.discount && isRoundingGap(synthesis.remainderBeforeDiscount, rules)
      ? { amount: synthesis.remainderBeforeDiscount }
      : null;

  const { notices } = recommendProgrammes({
    chapterScores: audit.chapterScores.map((c) => ({ chapter: c.chapter, score: c.score })),
    alerts: audit.chapters.flatMap((c) => c.alerts),
    catalogue,
  });

  return {
    proposal,
    content,
    pricing,
    synthesis,
    data,
    freshness: compareSourceFingerprint(proposal.sourceFingerprint, currentFingerprint),
    blockers,
    warnings,
    roundingOffer,
    rules,
    catalogueNotices: notices,
  };
}

export async function getProposalWorkspace(
  proposalId: string,
): Promise<ActionResult<ProposalWorkspace>> {
  const g = await guard(READ_ROLES);
  if (!g.ok) return { ok: false, error: g.error };
  const ws = await buildWorkspace(proposalId, g.user.tenantId);
  if (!ws) return { ok: false, error: 'Proposition introuvable' };
  return { ok: true, data: ws };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Éditer — contenu, chiffrage, remise
// ─────────────────────────────────────────────────────────────────────────────

/** Une proposition envoyée ou acceptée ne se réécrit pas : on en fait une version. */
const EDITABLE_STATUSES = ['BROUILLON', 'PRETE'] as const;

async function requireEditable(proposalId: string, tenantId: string) {
  const p = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId },
    select: { id: true, status: true, diagnosticId: true },
  });
  if (!p) return { ok: false as const, error: 'Proposition introuvable' };
  if (!(EDITABLE_STATUSES as readonly string[]).includes(p.status)) {
    return {
      ok: false as const,
      error:
        'Cette proposition est déjà partie chez le client : elle ne se modifie plus. Créez-en une nouvelle version.',
    };
  }
  return { ok: true as const, proposal: p };
}

async function persistAndReprint(args: {
  proposalId: string;
  tenantId: string;
  userId: string;
  diagnosticId: string;
  content?: ProposalContent;
  pricing?: ProposalPricing;
  action: string;
  diff: Prisma.InputJsonValue;
  extra?: Prisma.ProposalUpdateInput;
}): Promise<ActionResult> {
  const assembled = await assembleFromDiagnostic(args.diagnosticId, args.tenantId);
  if (!assembled) return { ok: false, error: 'Diagnostic introuvable' };
  const { bundle, rules, audit } = assembled;

  const current = await prisma.proposal.findFirst({
    where: { id: args.proposalId, tenantId: args.tenantId },
    select: { contentJson: true, pricingJson: true, validUntil: true },
  });
  if (!current) return { ok: false, error: 'Proposition introuvable' };

  const content = args.content ?? ProposalContentSchema.parse(current.contentJson);
  const pricing = args.pricing ?? ProposalPricingSchema.parse(current.pricingJson);

  const funding = buildFundingSection({
    funding: audit.funding,
    rules,
    agencyName: agencyNameOf(bundle),
    declaredEmployeeCount: audit.declaredEmployeeCount,
  });

  const fingerprint = computeProposalFingerprint({
    diagnostic: fingerprintInputOf(bundle, rules),
    pricing,
    content,
    validUntil: current.validUntil,
  });

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: args.proposalId },
      data: {
        contentJson: content as unknown as Prisma.InputJsonValue,
        pricingJson: pricing as unknown as Prisma.InputJsonValue,
        fundingJson: funding as unknown as Prisma.InputJsonValue,
        sourceFingerprint: fingerprint,
        ...args.extra,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        entity: 'Proposal',
        entityId: args.proposalId,
        action: args.action,
        diff: args.diff,
      },
    });
  });

  revalidateProposal(args.proposalId, args.diagnosticId);
  return { ok: true };
}

export async function updateProposalContent(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = z_UpdateContent.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const editable = await requireEditable(parsed.data.proposalId, g.user.tenantId);
  if (!editable.ok) return editable;

  return persistAndReprint({
    proposalId: parsed.data.proposalId,
    tenantId: g.user.tenantId,
    userId: g.user.id,
    diagnosticId: editable.proposal.diagnosticId,
    content: parsed.data.content,
    action: 'proposition.content.updated',
    diff: { axes: parsed.data.content.axes.length, heard: parsed.data.content.heard.length },
    // Toute modification du contenu invalide la relecture : on ne relit pas un
    // texte qu'on n'a pas encore écrit.
    extra: { reviewedAt: null },
  });
}

export async function updateProposalPricing(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = z_UpdatePricing.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const editable = await requireEditable(parsed.data.proposalId, g.user.tenantId);
  if (!editable.ok) return editable;

  const { values: rules } = await loadFundingRules(g.user.tenantId);
  const synthesis = computePricing({ pricing: parsed.data.pricing, rules });

  return persistAndReprint({
    proposalId: parsed.data.proposalId,
    tenantId: g.user.tenantId,
    userId: g.user.id,
    diagnosticId: editable.proposal.diagnosticId,
    pricing: parsed.data.pricing,
    action: 'proposition.pricing.updated',
    diff: {
      totalHt: synthesis.totalHt,
      totalCoverage: synthesis.totalCoverage,
      finalRemainder: synthesis.finalRemainder,
      conventionedHours: synthesis.conventionedHoursMax,
    },
    // Un prix qui change change le document : la relecture et la validation de
    // remise repartent à zéro.
    extra: { reviewedAt: null, discountApprovedAt: null, discountApprovedById: null },
  });
}

export async function setProposalDiscount(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const parsed = z_SetDiscount.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const editable = await requireEditable(parsed.data.proposalId, g.user.tenantId);
  if (!editable.ok) return editable;

  const current = await prisma.proposal.findFirst({
    where: { id: parsed.data.proposalId, tenantId: g.user.tenantId },
    select: { pricingJson: true },
  });
  if (!current) return { ok: false, error: 'Proposition introuvable' };

  const pricing = ProposalPricingSchema.parse(current.pricingJson);
  const next: ProposalPricing = { ...pricing, discount: parsed.data.discount };

  const { values: rules } = await loadFundingRules(g.user.tenantId);
  const synthesis = computePricing({ pricing: next, rules });

  const blocking = synthesis.alerts.find((a) => a.code === 'remise_sans_reste_a_charge');
  if (blocking) return { ok: false, error: blocking.label };

  return persistAndReprint({
    proposalId: parsed.data.proposalId,
    tenantId: g.user.tenantId,
    userId: g.user.id,
    diagnosticId: editable.proposal.diagnosticId,
    pricing: next,
    action: parsed.data.discount ? 'proposition.discount.set' : 'proposition.discount.cleared',
    diff: {
      amount: synthesis.discount?.amount ?? 0,
      percent: synthesis.discountPercent,
      reason: synthesis.discount?.reason ?? null,
      kind: synthesis.discount?.kind ?? null,
      requiresApproval: synthesis.discountRequiresApproval,
    },
    // Une remise remise à plat annule la validation précédente : c'est un
    // nouveau montant, il se valide à nouveau.
    extra: { reviewedAt: null, discountApprovedAt: null, discountApprovedById: null },
  });
}

/**
 * Offrir l'arrondi de parcours en un clic (D-11).
 *
 * Le moteur budget arrondit à la demi-journée supérieure pour ne perdre aucun
 * droit ; le dépassement — quelques dizaines d'euros — tombe en reste à
 * charge. Ce geste-là reste une remise comme les autres : tracée, motivée, et
 * soumise au même seuil de validation.
 */
export async function offerRoundingGap(proposalId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const ws = await buildWorkspace(proposalId, g.user.tenantId);
  if (!ws) return { ok: false, error: 'Proposition introuvable' };
  if (!ws.roundingOffer) {
    return {
      ok: false,
      error:
        "Le reste à charge n'est pas un simple arrondi de parcours : au-delà d'une demi-journée facturée, c'est une négociation, pas un geste automatique.",
    };
  }

  return setProposalDiscount({
    proposalId,
    discount: {
      amount: ws.roundingOffer.amount,
      reason: ROUNDING_DISCOUNT_REASON,
      kind: 'ARRONDI',
    },
  });
}

/** La validation d'une remise au-delà du seuil — MANAGER ou ADMIN (D-3). */
export async function approveProposalDiscount(proposalId: string): Promise<ActionResult> {
  const g = await guard(DISCOUNT_APPROVAL_ROLES);
  if (!g.ok) return { ok: false, error: g.error };

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: g.user.tenantId },
    select: { id: true, diagnosticId: true, pricingJson: true, status: true },
  });
  if (!proposal) return { ok: false, error: 'Proposition introuvable' };

  const { values: rules } = await loadFundingRules(g.user.tenantId);
  const synthesis = computePricing({
    pricing: ProposalPricingSchema.parse(proposal.pricingJson),
    rules,
  });
  if (!synthesis.discountRequiresApproval) {
    return {
      ok: false,
      error: 'Cette remise ne requiert aucune validation : il n’y a rien à approuver.',
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposalId },
      data: { discountApprovedAt: new Date(), discountApprovedById: g.user.id },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'Proposal',
        entityId: proposalId,
        action: 'proposition.discount.approved',
        diff: {
          amount: synthesis.discount?.amount ?? 0,
          percent: synthesis.discountPercent,
          reason: synthesis.discount?.reason ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  });

  revalidateProposal(proposalId, proposal.diagnosticId);
  return { ok: true };
}

/** La relecture humaine — la porte que l'IA ne peut pas ouvrir elle-même (§10). */
export async function markProposalReviewed(proposalId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const editable = await requireEditable(proposalId, g.user.tenantId);
  if (!editable.ok) return editable;

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposalId },
      data: { reviewedAt: new Date(), status: 'PRETE' },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'Proposal',
        entityId: proposalId,
        action: 'proposition.reviewed',
        diff: {} as Prisma.InputJsonValue,
      },
    });
  });

  revalidateProposal(proposalId, editable.proposal.diagnosticId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Le PDF
// ─────────────────────────────────────────────────────────────────────────────

export async function generateProposalPdf(
  proposalId: string,
): Promise<ActionResult<{ documentId: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const ws = await buildWorkspace(proposalId, g.user.tenantId);
  if (!ws) return { ok: false, error: 'Proposition introuvable' };

  const html = renderPropositionHtml(ws.data);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdfWeasy(html);
  } catch (e) {
    console.error('[proposition] rendu PDF', e);
    return {
      ok: false,
      error: `Le rendu PDF a échoué : ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const hash = createHash('sha256').update(pdf).digest('hex');
  const objectKey = `propositions/${g.user.tenantId}/${ws.proposal.reference}-v${ws.proposal.version}-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdf, 'application/pdf');
  } catch (e) {
    console.error('[proposition] upload', e);
    return { ok: false, error: 'Le dépôt du PDF a échoué.' };
  }

  try {
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: g.user.tenantId,
          type: 'PROPOSITION',
          entityType: 'Proposal',
          entityId: proposalId,
          pdfUrl: objectKey,
          hashSha256: hash,
        },
        select: { id: true },
      });
      await tx.proposal.update({
        where: { id: proposalId },
        data: { pdfKey: objectKey },
      });
      await tx.auditLog.create({
        data: {
          tenantId: g.user.tenantId,
          userId: g.user.id,
          entity: 'Proposal',
          entityId: proposalId,
          action: 'proposition.pdf.generated',
          diff: {
            documentId: doc.id,
            totalHt: ws.synthesis.totalHt,
            finalRemainder: ws.synthesis.finalRemainder,
            coverageState: ws.synthesis.coverageState,
            sections: 6,
          } as Prisma.InputJsonValue,
        },
      });
      return doc;
    });

    revalidateProposal(proposalId, ws.proposal.diagnosticId);
    return { ok: true, data: { documentId: document.id } };
  } catch (e) {
    console.error('[proposition] persistance', e);
    return { ok: false, error: "L'enregistrement de la proposition a échoué." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le lien public — token hashé, affiché une seule fois (§9.4)
// ─────────────────────────────────────────────────────────────────────────────

export async function issueProposalPublicLink(
  proposalId: string,
): Promise<ActionResult<{ token: string; expiresAt: Date }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: g.user.tenantId },
    select: { id: true, diagnosticId: true, validUntil: true, reviewedAt: true },
  });
  if (!proposal) return { ok: false, error: 'Proposition introuvable' };
  if (!proposal.reviewedAt) {
    return {
      ok: false,
      error: 'Relisez la proposition avant d’en diffuser le lien : un lien public est une remise.',
    };
  }

  const token = randomBytes(PUBLIC_TOKEN_BYTES).toString('hex');
  const expiresAt = proposal.validUntil ?? new Date(Date.now() + 30 * 24 * 3600 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposalId },
      data: { publicTokenHash: hashPublicToken(token), publicTokenExpiresAt: expiresAt },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'Proposal',
        entityId: proposalId,
        action: 'proposition.public_link.issued',
        // Le token brut n'entre jamais dans un journal : seule sa date de fin.
        diff: { expiresAt: expiresAt.toISOString() } as Prisma.InputJsonValue,
      },
    });
  });

  revalidateProposal(proposalId, proposal.diagnosticId);
  return { ok: true, data: { token, expiresAt } };
}

export async function revokeProposalPublicLink(proposalId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, tenantId: g.user.tenantId },
    select: { id: true, diagnosticId: true },
  });
  if (!proposal) return { ok: false, error: 'Proposition introuvable' };

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposalId },
      data: { publicTokenHash: null, publicTokenExpiresAt: null },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'Proposal',
        entityId: proposalId,
        action: 'proposition.public_link.revoked',
        diff: {} as Prisma.InputJsonValue,
      },
    });
  });

  revalidateProposal(proposalId, proposal.diagnosticId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Les devis — un par payeur, au centime
// ─────────────────────────────────────────────────────────────────────────────

export async function generateProposalQuotes(
  proposalId: string,
): Promise<ActionResult<{ numbers: string[] }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const ws = await buildWorkspace(proposalId, g.user.tenantId);
  if (!ws) return { ok: false, error: 'Proposition introuvable' };

  if (ws.proposal.quotes.length > 0) {
    return {
      ok: false,
      error: `Des devis existent déjà pour cette proposition (${ws.proposal.quotes.map((q) => q.number).join(', ')}). Supprimez-les avant d’en générer de nouveaux.`,
    };
  }
  if (ws.synthesis.payers.length === 0) {
    return { ok: false, error: 'Aucun payeur : il n’y a aucun devis à générer.' };
  }

  const drafts = buildQuoteDrafts({
    synthesis: ws.synthesis,
    proposalReference: ws.proposal.reference,
    onsiteHoursPerHalfDay: ws.rules.HALF_DAY_ONSITE_HOURS,
  });

  // Le test de contrat de la spec, joué à chaud : si la somme des devis ne
  // retombe pas exactement sur le coût pédagogique, on n'écrit rien.
  if (!quotesMatchProposal(drafts, ws.synthesis)) {
    console.error('[proposition] écart devis/proposition', {
      proposalId,
      devis: drafts.reduce((s, d) => s + d.amountHt, 0),
      proposition: ws.synthesis.totalHt,
    });
    return {
      ok: false,
      error:
        'La somme des devis ne retombe pas sur le total de la proposition. Rien n’a été créé — c’est un défaut de calcul, pas une saisie à corriger.',
    };
  }

  try {
    const numbers = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      for (const draft of drafts) {
        const number = await generateQuoteNumber(g.user.tenantId, tx);
        const quote = await tx.quote.create({
          data: {
            tenantId: g.user.tenantId,
            number,
            status: 'DRAFT',
            recipientName: draft.recipientName,
            recipientContact: draft.recipientContact,
            recipientAddress: draft.recipientAddress,
            recipientEmail: draft.recipientEmail,
            recipientSiret: draft.recipientSiret,
            title: draft.title,
            notes: draft.notes,
            validUntil: ws.proposal.validUntil,
            proposalId,
            amountHT: new Prisma.Decimal(draft.amountHt),
            amountVAT: new Prisma.Decimal(0),
            amountTTC: new Prisma.Decimal(draft.amountHt),
          },
          select: { id: true, number: true },
        });
        await tx.quoteLine.createMany({
          data: draft.lines.map((l) => ({
            quoteId: quote.id,
            order: l.order,
            description: l.description,
            quantity: new Prisma.Decimal(l.quantity),
            unitPriceHT: new Prisma.Decimal(l.unitPriceHt),
            vatRate: new Prisma.Decimal(l.vatRate),
            lineTotalHT: new Prisma.Decimal(l.lineTotalHt),
          })),
        });
        created.push(quote.number);
      }

      await tx.auditLog.create({
        data: {
          tenantId: g.user.tenantId,
          userId: g.user.id,
          entity: 'Proposal',
          entityId: proposalId,
          action: 'proposition.quotes.generated',
          diff: {
            numbers: created,
            totalHt: ws.synthesis.totalHt,
            conventionedHours: ws.synthesis.conventionedHoursMax,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    revalidateProposal(proposalId, ws.proposal.diagnosticId);
    return { ok: true, data: { numbers } };
  } catch (e) {
    console.error('[proposition] génération des devis', e);
    return { ok: false, error: 'La génération des devis a échoué. Aucun devis n’a été créé.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Envoi et suites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marquer la proposition remise au client.
 *
 * ⚠ L'envoi par email n'est pas branché ici : le mailer est gelé jusqu'au
 * 10/09/2026 (décision Laurent, chantier stand MLS). Cette action enregistre
 * la remise — le commercial transmet le PDF ou le lien par son propre canal,
 * ce que la spec prévoit explicitement (§9.1, « OU par le canal du commercial »).
 */
export async function markProposalSent(proposalId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const ws = await buildWorkspace(proposalId, g.user.tenantId);
  if (!ws) return { ok: false, error: 'Proposition introuvable' };

  if (ws.blockers.length > 0) {
    return { ok: false, error: ws.blockers[0]! };
  }
  if (ws.proposal.status === 'ENVOYEE') return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: 'ENVOYEE', sentAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        tenantId: g.user.tenantId,
        userId: g.user.id,
        entity: 'Proposal',
        entityId: proposalId,
        action: 'proposition.sent',
        diff: {
          totalHt: ws.synthesis.totalHt,
          finalRemainder: ws.synthesis.finalRemainder,
          coverageState: ws.synthesis.coverageState,
        } as Prisma.InputJsonValue,
      },
    });
  });

  revalidateProposal(proposalId, ws.proposal.diagnosticId);
  return { ok: true };
}

// Schémas locaux : ils référencent les schémas partagés, mais restent ici pour
// que le contrat d'entrée d'une action se lise à côté de l'action.
import { z } from 'zod';

const z_UpdateContent = z.object({
  proposalId: z.string().uuid(),
  content: ProposalContentSchema,
});
const z_UpdatePricing = z.object({
  proposalId: z.string().uuid(),
  pricing: ProposalPricingSchema,
});
const z_SetDiscount = z.object({
  proposalId: z.string().uuid(),
  discount: PricingDiscountSchema.nullable(),
});
