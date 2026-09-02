'use server';

/**
 * Génération du rapport d'audit de performance (lot D).
 *
 * Chaîne : lecture du diagnostic → moteurs purs → HTML 17 pages → WeasyPrint →
 * MinIO → `Document` de type `DIAGNOSTIC_AUDIT`.
 *
 * Deux choses qui ne se négocient pas :
 *   • l'empreinte des données rendues est stockée sur le diagnostic, pour que
 *     l'écran sache dire « cet audit ne correspond plus à ce que vous avez
 *     saisi » plutôt que de laisser circuler un PDF qui ment ;
 *   • aucun chiffre n'est calculé ici. Les moteurs purs ont déjà tranché.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { REFERENTIAL_VERSION } from '@qualiof/shared/diagnostic';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { loadOfConfig } from '@/lib/of-config';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { buildAuditData } from '@/lib/diagnostic-r1/audit-builder';
import { renderAuditHtml } from '@/lib/diagnostic-r1/templates/audit-template';
import {
  compareSourceFingerprint,
  computeSourceFingerprint,
  type FingerprintComparison,
} from '@/lib/diagnostic-r1/fingerprint';
import { SCORING_VERSION } from '@/lib/diagnostic-r1/scoring';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Valeur affichée en couverture (§9.2). Paramètre de tenant à terme ; en dur
 * ici tant que la table de paramètres commerciaux n'existe pas — mais nommé,
 * pas noyé dans le template.
 */
const AUDIT_VALUE_EUROS = 3000;

async function loadDiagnosticForAudit(diagnosticId: string, tenantId: string) {
  return prisma.diagnostic.findFirst({
    where: { id: diagnosticId, tenantId },
    select: {
      id: true,
      reference: true,
      variant: true,
      status: true,
      referentialVersion: true,
      sourceFingerprint: true,
      organization: { select: { legalName: true } },
      lead: { select: { firstName: true, lastName: true, notes: true } },
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

function agencyNameOf(d: NonNullable<Awaited<ReturnType<typeof loadDiagnosticForAudit>>>): string {
  return (
    d.organization?.legalName ??
    d.lead.notes?.replace(/^Agence\s*:\s*/, '').trim() ??
    [d.lead.firstName, d.lead.lastName].filter(Boolean).join(' ') ??
    d.reference
  );
}

/** Les données du rapport, telles qu'elles seront rendues — et leur empreinte. */
async function assemble(diagnosticId: string, tenantId: string) {
  const diagnostic = await loadDiagnosticForAudit(diagnosticId, tenantId);
  if (!diagnostic) return null;

  const [{ values: rules }, of] = await Promise.all([
    loadFundingRules(tenantId),
    loadOfConfig(tenantId),
  ]);

  const answers = diagnostic.answers.map((a) => ({
    questionId: a.questionId,
    value: a.value,
    isSkipped: a.isSkipped,
  }));

  // Decimal → number : sans Number(), toute comparaison serait fausse.
  const participants = diagnostic.participants.map((p) => ({
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

  const fingerprint = computeSourceFingerprint({
    answers,
    participants,
    rules,
    scoringVersion: SCORING_VERSION,
    referentialVersion: diagnostic.referentialVersion || REFERENTIAL_VERSION,
  });

  return { diagnostic, rules, of, answers, participants, fingerprint };
}

/**
 * L'audit en base correspond-il encore aux données saisies ?
 * Lecture seule — appelée par la fiche diagnostic pour afficher le bandeau.
 */
export async function getAuditFreshness(diagnosticId: string): Promise<
  ActionResult<{
    hasDocument: boolean;
    freshness: FingerprintComparison;
    documentId: string | null;
  }>
> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'LECTEUR']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const assembled = await assemble(diagnosticId, user.tenantId);
  if (!assembled) return { ok: false, error: 'Diagnostic introuvable' };

  const doc = await prisma.document.findFirst({
    where: {
      tenantId: user.tenantId,
      type: 'DIAGNOSTIC_AUDIT',
      entityType: 'Diagnostic',
      entityId: diagnosticId,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  return {
    ok: true,
    data: {
      hasDocument: Boolean(doc),
      freshness: compareSourceFingerprint(
        assembled.diagnostic.sourceFingerprint,
        assembled.fingerprint,
      ),
      documentId: doc?.id ?? null,
    },
  };
}

export async function generateDiagnosticAudit(
  diagnosticId: string,
): Promise<ActionResult<{ documentId: string; pages: number }>> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const assembled = await assemble(diagnosticId, user.tenantId);
  if (!assembled) return { ok: false, error: 'Diagnostic introuvable' };
  const { diagnostic, rules, of, answers, participants, fingerprint } = assembled;

  if (answers.length === 0) {
    return {
      ok: false,
      error: "Ce diagnostic ne porte aucune réponse : il n'y a rien à restituer.",
    };
  }

  const data = buildAuditData({
    reference: diagnostic.reference,
    agencyName: agencyNameOf(diagnostic),
    generatedAt: new Date(),
    variant: diagnostic.variant,
    answers,
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

  const html = renderAuditHtml(data);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdfWeasy(html);
  } catch (e) {
    console.error('[diagnostic-audit] rendu PDF', e);
    return {
      ok: false,
      error: `Le rendu PDF a échoué : ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const hash = createHash('sha256').update(pdf).digest('hex');
  const objectKey = `diagnostics/${user.tenantId}/${diagnostic.reference}-audit-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdf, 'application/pdf');
  } catch (e) {
    console.error('[diagnostic-audit] upload', e);
    return { ok: false, error: 'Le dépôt du PDF a échoué.' };
  }

  try {
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: user.tenantId,
          type: 'DIAGNOSTIC_AUDIT',
          entityType: 'Diagnostic',
          entityId: diagnostic.id,
          pdfUrl: objectKey,
          hashSha256: hash,
        },
        select: { id: true },
      });

      // L'empreinte des DONNÉES, pas du PDF : c'est elle qui dira demain si le
      // document est encore à jour.
      await tx.diagnostic.update({
        where: { id: diagnostic.id },
        data: { sourceFingerprint: fingerprint },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Diagnostic',
          entityId: diagnostic.id,
          action: 'diagnostic.audit.generated',
          diff: {
            documentId: doc.id,
            globalScore: data.globalScore,
            scoringVersion: data.scoringVersion,
            generationSource: data.generationSource,
            answersRestituted: data.chapters.reduce((s, c) => s + c.answers.length, 0),
          } as Prisma.InputJsonValue,
        },
      });

      return doc;
    });

    revalidatePath('/app/diagnostics');
    revalidatePath(`/app/diagnostics/${diagnostic.id}`);
    return { ok: true, data: { documentId: document.id, pages: 17 } };
  } catch (e) {
    console.error('[diagnostic-audit] persistance', e);
    return { ok: false, error: "L'enregistrement du rapport a échoué." };
  }
}
