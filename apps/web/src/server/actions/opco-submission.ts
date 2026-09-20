'use server';

import { isCompanyDossier } from '@/lib/opco/company-dossier';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma, type OpcoSubmissionStatus } from '@qualiof/db';
import {
  OpcoIdSchema,
  DossierStageSchema,
  OpcoDraftPatchSchema,
  CfpPostalCodeSchema,
} from '@qualiof/shared';
import { requireRole } from '@/lib/rbac';
import { sendMail } from '@/lib/mailer';
import { downloadFile, objectExists, DOCS_BUCKET } from '@/lib/storage';
import {
  piecesNonSignees,
  messageDossierIncomplet,
  type KindPieceDossier,
} from '@/lib/opco/pieces-dossier';
import { buildOpcoSubmission } from '@/lib/opco/build-submission';
import {
  controlePiecesAgefice,
  FORMATION_EMAIL,
  type DossierStage,
} from '@/lib/opco/agefice-envoi';
import { estEligibleAgefice } from '@/lib/agefice/eligibilite';

async function actor() {
  try {
    return await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch {
    return null;
  }
}
function invalidate(sessionId?: string, id?: string) {
  revalidatePath('/app/dossiers-opco');
  if (sessionId) revalidatePath(`/app/sessions/${sessionId}`);
  if (id) revalidatePath(`/app/dossiers-opco/envoyer/${id}`);
}
export interface SubmissionAttachment {
  /** clé MinIO du fichier */
  key: string;
  filename: string;
  /** kind = DocType-like pour la sémantique métier */
  kind: KindPieceDossier;
  /** Inclure (true par défaut) ou non dans l'envoi */
  included: boolean;
  /**
   * Lot D — cette pièce porte-t-elle une signature ?
   *
   * Écrit au moment de la composition, relu à l'envoi : c'est lui qui décide du
   * refus « dossier incomplet ». Optionnel parce que les dossiers composés
   * AVANT le lot D n'en portent pas. Pour AGEFICE, une preuve inconnue bloque
   * désormais l’envoi jusqu’à actualisation des pièces.
   */
  signe?: boolean;
}

export interface ComposeResult {
  ok: boolean;
  submissionId?: string;
  redirectTo?: string;
  /** Pièces présentes (attachments[].included === true par défaut) */
  attachments?: SubmissionAttachment[];
  /** Pièces manquantes (à ajouter manuellement avant envoi) */
  missing?: SubmissionAttachment['kind'][];
  /**
   * Lot D — pourquoi aucune adresse n'a pu être pré-remplie. Non nul EXACTEMENT
   * quand `recipientEmail` est resté vide : l'admin doit savoir s'il manque un
   * point d'accueil AGEFICE ou une adresse sur la fiche organisation.
   */
  avertissementDestinataire?: string | null;
  /** Lot D — les pièces exigées présentes au dossier mais non signées. */
  nonSignees?: SubmissionAttachment['kind'][];
  error?: string;
}

export async function composeOpcoSubmission(
  participantId: string,
  stage: DossierStage = 'PRISE_EN_CHARGE',
): Promise<ComposeResult> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  if (
    !OpcoIdSchema.safeParse(participantId).success ||
    !DossierStageSchema.safeParse(stage).success
  )
    return { ok: false, error: 'Dossier invalide' };
  const built = await buildOpcoSubmission(participantId, user, stage);
  if (!built.ok) return built;
  if (built.company) return {
    ok: true,
    redirectTo: `/app/sessions/${built.participant.sessionId}?tab=avant#depot-${built.participant.sponsorOrgId}`,
  };
  if (built.invoiceId && ['ADMIN', 'MANAGER', 'COMPTABLE'].includes(user.role)) {
    const { generateAcquittedInvoicePdf } = await import('./invoices');
    const result = await generateAcquittedInvoicePdf({ invoiceId: built.invoiceId });
    if (!result.ok) return result;
  }
  if (built.invoiceId && user.role === 'COMMERCIAL') {
    const invoiceKey = built.attachments.find((a) => a.kind === 'FACTURE_ACQUITTEE')?.key;
    if (!invoiceKey || !(await objectExists(DOCS_BUCKET, invoiceKey)))
      return {
        ok: false,
        error:
          'Demandez à un administrateur, gestionnaire ou comptable de générer la facture acquittée, puis préparez à nouveau le dossier.',
      };
  }
  const sub = await prisma.$transaction(async (tx) => {
    // Même apprenant/étape : un brouillon ou un envoi actif, y compris doubles clics.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.tenantId + ':' + participantId + ':' + stage}))`;
    const existing = await tx.opcoSubmission.findFirst({
      where: {
        tenantId: user.tenantId,
        participantId,
        stage,
        status: { notIn: ['CANCELED', 'REJECTED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    const created = await tx.opcoSubmission.create({
      data: {
        tenantId: user.tenantId,
        participantId,
        sponsorOrgId: built.participant.sponsorOrgId,
        stage,
        recipientEmail: built.recipientEmail,
        subject: built.subject,
        bodyHtml: built.bodyHtml,
        attachments: built.attachments as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'OpcoSubmission',
        entityId: created.id,
        action: 'opco.composed',
        diff: { stage, pieceKinds: built.attachments.map((a) => a.kind) },
      },
    });
    return created;
  });
  invalidate(built.participant.sessionId, sub.id);
  return {
    ok: true,
    submissionId: sub.id,
    attachments: sub.attachments as unknown as SubmissionAttachment[],
    missing: built.missing,
    avertissementDestinataire: built.avertissementDestinataire,
  };
}

export async function refreshOpcoSubmissionDraft(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  if (!OpcoIdSchema.safeParse(id).success) return { ok: false, error: 'Dossier invalide' };
  const sub = await prisma.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!sub || sub.status !== 'DRAFT' || sub.deliveryState !== 'READY')
    return { ok: false, error: 'Seul un brouillon disponible peut être actualisé.' };
  const stage = DossierStageSchema.safeParse(sub.stage);
  if (!stage.success) return { ok: false, error: 'Étape inconnue' };
  const built = await buildOpcoSubmission(sub.participantId, user, stage.data);
  if (!built.ok) return built;
  // Le duplicata est produit par le moteur existant, sans inventer de paiement.
  if (built.invoiceId && ['ADMIN', 'MANAGER', 'COMPTABLE'].includes(user.role)) {
    const { generateAcquittedInvoicePdf } = await import('./invoices');
    const result = await generateAcquittedInvoicePdf({ invoiceId: built.invoiceId });
    if (!result.ok) return result;
  }
  if (built.invoiceId && user.role === 'COMMERCIAL') {
    const key = built.attachments.find((a) => a.kind === 'FACTURE_ACQUITTEE')?.key;
    if (!key || !(await objectExists(DOCS_BUCKET, key)))
      return {
        ok: false,
        error:
          'La facture acquittée doit être générée par un administrateur, gestionnaire ou comptable.',
      };
  }
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.opcoSubmission.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        status: 'DRAFT',
        deliveryState: 'READY',
        updatedAt: sub.updatedAt,
      },
      data: {
        attachments: built.attachments as unknown as Prisma.InputJsonValue,
        lastError: null,
        ...(stage.data === 'FIN_FORMATION' ? { recipientEmail: built.recipientEmail } : {}),
      },
    });
    if (updated.count)
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'OpcoSubmission',
          entityId: id,
          action: 'opco.pieces_refreshed',
          diff: { pieceKinds: built.attachments.map((a) => a.kind) },
        },
      });
    return updated.count;
  });
  invalidate(built.participant.sessionId, id);
  return changed ? { ok: true } : { ok: false, error: 'Le dossier a changé. Rechargez la page.' };
}

export async function sendOpcoSubmission(
  id: string,
  options: { force?: boolean } = {},
): Promise<{ ok: boolean; error?: string; dryRun?: boolean }> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  if (!OpcoIdSchema.safeParse(id).success) return { ok: false, error: 'Dossier invalide' };
  // Claim atomique AVANT lecture du contenu : l'éditeur ne peut plus le modifier.
  const claimed = await prisma.$transaction(async (tx) => {
    const target = await tx.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!target) return { count: 0 };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.tenantId + ':' + target.participantId + ':' + target.stage}))`;
    const other = await tx.opcoSubmission.findFirst({
      where: {
        tenantId: user.tenantId,
        participantId: target.participantId,
        stage: target.stage,
        id: { not: id },
        OR: [
          { status: { notIn: ['DRAFT', 'CANCELED', 'REJECTED'] } },
          { status: 'DRAFT', deliveryState: { not: 'READY' } },
        ],
      },
    });
    if (other) return { count: 0 };
    return tx.opcoSubmission.updateMany({
      where: { id, tenantId: user.tenantId, status: 'DRAFT', deliveryState: 'READY' },
      data: { deliveryState: 'SENDING', sendingStartedAt: new Date(), lastError: null },
    });
  });
  if (!claimed.count)
    return {
      ok: false,
      error: 'Dossier déjà envoyé, en cours ou à vérifier. Aucun nouvel envoi effectué.',
    };
  let smtpStarted = false;
  const release = async (error: string, state = 'READY') => {
    await prisma.opcoSubmission.updateMany({
      where: { id, tenantId: user.tenantId, deliveryState: 'SENDING' },
      data: {
        deliveryState: state,
        lastError: error,
        sendingStartedAt: state === 'READY' ? null : undefined,
      },
    });
    invalidate(undefined, id);
    return { ok: false as const, error };
  };
  try {
    const sub = await prisma.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!sub) return await release('Dossier introuvable');
    const validation = OpcoDraftPatchSchema.safeParse({
      recipientEmail: sub.recipientEmail,
      subject: sub.subject,
      bodyHtml: sub.bodyHtml,
    });
    const stage = DossierStageSchema.safeParse(sub.stage);
    if (!validation.success || !stage.success)
      return await release('Vérifiez le destinataire, l’objet et le message.');
    const built = await buildOpcoSubmission(sub.participantId, user, stage.data);
    if (!built.ok) return await release(built.error);
    if (built.company) return await release(
      'Les dossiers salariés se déposent sur le portail OPCO. Téléchargez les pièces et déclarez le dépôt depuis la session.',
    );
    const attachments = (sub.attachments as unknown as SubmissionAttachment[]).filter(
      (a) => a.included,
    );
    if (!attachments.length) return await release('Aucune pièce jointe sélectionnée');
    if (built.agefice) {
      const blocked = controlePiecesAgefice(attachments, stage.data);
      if (blocked) return await release(blocked);
      if (stage.data === 'PRISE_EN_CHARGE' && !built.nir)
        return await release(
          'Numéro de sécurité sociale absent ou invalide : corrigez la fiche apprenant puis le message.',
        );
      if (
        stage.data === 'PRISE_EN_CHARGE' &&
        !sub.bodyHtml!.replace(/\s/g, '').includes(built.nir!)
      )
        return await release(
          'Le numéro de sécurité sociale du message ne correspond plus à la fiche. Actualisez le message.',
        );
      if (!built.recipientEmail)
        return await release(
          built.avertissementDestinataire ?? 'Point d’accueil AGEFICE à renseigner.',
        );
      if (sub.recipientEmail!.toLowerCase() !== built.recipientEmail.toLowerCase())
        return await release(
          stage.data === 'FIN_FORMATION'
            ? 'Le remboursement doit être adressé au destinataire confirmé de l’envoi initial. Actualisez les pièces.'
            : 'Le destinataire diffère du point d’accueil actuel. Corrigez le point d’accueil ou le destinataire.',
        );
    } else {
      const unsigned = piecesNonSignees(
        attachments.map((a) => ({ kind: a.kind, signe: a.signe === true })),
      );
      if (unsigned.length && !(options.force && user.role === 'ADMIN'))
        return await release(messageDossierIncomplet(unsigned));
    }
    // Relecture des sources : aucune clé arbitraire ni version signée révoquée.
    if (
      attachments.some(
        (a) =>
          !built.attachments.some(
            (b) => b.key === a.key && b.kind === a.kind && b.signe === a.signe,
          ),
      )
    )
      return await release('Les pièces ont changé. Actualisez les pièces du dossier avant envoi.');
    if (built.agefice) {
      const blocked = controlePiecesAgefice(built.attachments, stage.data);
      if (blocked) return await release(blocked);
    }
    const mailAttachments = await Promise.all(
      attachments.map(async (a) => ({
        filename: a.filename,
        content: await downloadFile(DOCS_BUCKET, a.key),
      })),
    );
    // Marge sous les limites usuelles SMTP/Vercel ; rien n'est omis silencieusement.
    if (mailAttachments.reduce((n, a) => n + a.content.length, 0) > 15 * 1024 * 1024)
      return await release(
        'Pièces trop volumineuses (maximum 15 Mo). Réduisez les scans puis actualisez le dossier.',
      );
    const keys = attachments.map((a) => a.key);
    const docs = await prisma.document.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ pdfUrl: { in: keys } }, { signedPdfUrl: { in: keys } }],
      },
      select: { id: true },
    });
    smtpStarted = true;
    const result = await sendMail({
      ...(built.agefice
        ? { from: `Start Academy <${FORMATION_EMAIL}>`, cc: FORMATION_EMAIL }
        : user.email
          ? { cc: user.email }
          : {}),
      to: sub.recipientEmail!,
      subject: sub.subject!,
      html: sub.bodyHtml!,
      text: sub
        .bodyHtml!.replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, ''),
      attachments: mailAttachments,
      context: {
        tenantId: user.tenantId,
        category: 'opco_submission',
        sessionId: built.participant.sessionId,
        documentIds: docs.map((d) => d.id),
        relatedEntity: `opcoSubmission:${id}`,
      },
    });
    if (result.dryRun || result.suppressed) {
      await release('Aucun email envoyé : mode test ou envoi désactivé dans les paramètres.');
      return { ok: true, dryRun: true };
    }
    if (!result.ok)
      return await release(
        'Envoi non confirmé. Vérifiez la messagerie avant toute nouvelle tentative.',
        'UNCERTAIN',
      );
    await prisma.$transaction(async (tx) => {
      await tx.opcoSubmission.updateMany({
        where: { id, tenantId: user.tenantId, deliveryState: 'SENDING' },
        data: {
          status: 'SENT',
          deliveryState: 'READY',
          sentAt: new Date(),
          threadId: result.messageId ?? null,
          lastError: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'OpcoSubmission',
          entityId: id,
          action: 'opco.sent',
          diff: {
            stage: stage.data,
            recipient: sub.recipientEmail,
            pieceKinds: attachments.map((a) => a.kind),
            messageId: result.messageId ?? null,
          },
        },
      });
    });
    invalidate(built.participant.sessionId, id);
    return { ok: true };
  } catch {
    return await release(
      smtpStarted
        ? 'Résultat de l’envoi incertain. Vérifiez la messagerie avant de réessayer.'
        : 'Impossible de préparer les pièces. Vérifiez les fichiers, générez la facture acquittée si nécessaire puis actualisez les pièces.',
      smtpStarted ? 'UNCERTAIN' : 'READY',
    );
  }
}
export async function markOpcoSubmissionStatus(
  submissionId: string,
  next: OpcoSubmissionStatus,
  notes?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  if (
    !OpcoIdSchema.safeParse(submissionId).success ||
    !['SENT', 'ACK_RECEIVED', 'APPROVED', 'REJECTED', 'REIMBURSED', 'CANCELED'].includes(next)
  )
    return { ok: false, error: 'Transition invalide' };

  const sub = await prisma.opcoSubmission.findFirst({
    where: { id: submissionId, tenantId: user.tenantId },
    select: { id: true, participantId: true, status: true, deliveryState: true, updatedAt: true },
  });
  if (!sub) return { ok: false, error: 'Dossier introuvable' };

  if (sub.deliveryState !== 'READY')
    return {
      ok: false,
      error: 'Envoi en cours ou incertain : vérifiez sa réception avant de modifier son statut.',
    };
  if (sub.status === next) return { ok: true };
  if (sub.status === 'DRAFT' && !['CANCELED', 'SENT'].includes(next))
    return { ok: false, error: 'Le dossier doit être envoyé avant de suivre son instruction.' };
  if (next === 'SENT') {
    const details = await getOpcoSubmission(sub.id);
    if (details?.company) return { ok: false, error: 'Déclarez le dépôt sur le portail OPCO depuis la session.' };
    if (details?.agefice) return { ok: false, error: 'Utilisez le bouton d’envoi AGEFICE.' };
  }
  const now = new Date();
  const data: Prisma.OpcoSubmissionUpdateInput = {
    status: next,
    ...(notes ? { internalNotes: notes } : {}),
  };
  if (next === 'SENT') data.sentAt = now;
  if (next === 'ACK_RECEIVED') data.ackAt = now;
  if (next === 'APPROVED') data.approvedAt = now;
  if (next === 'REJECTED') data.rejectedAt = now;
  if (next === 'REIMBURSED') data.reimbursedAt = now;

  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.opcoSubmission.updateMany({
      where: {
        id: sub.id,
        tenantId: user.tenantId,
        status: sub.status,
        deliveryState: 'READY',
        updatedAt: sub.updatedAt,
      },
      data,
    });
    if (!updated.count) return false;
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'OpcoSubmission',
        entityId: sub.id,
        action: 'opco.status',
        diff: { before: sub.status, after: next },
      },
    });
    // Synchro timeline OPCO 4-étapes
    if (next === 'APPROVED') {
      await tx.sessionParticipant.update({
        where: { id: sub.participantId, session: { tenantId: user.tenantId } },
        data: { opcoApproved: true, opcoApprovedAt: now },
      });
    }
    if (next === 'REIMBURSED') {
      await tx.sessionParticipant.update({
        where: { id: sub.participantId, session: { tenantId: user.tenantId } },
        data: { opcoReimbursed: true, opcoReimbursedAt: now },
      });
    }
    return true;
  });
  if (!changed) return { ok: false, error: 'Le dossier a changé. Rechargez la page.' };

  revalidatePath('/app/dossiers-opco');
  return { ok: true };
}

export async function listOpcoSubmissionsForParticipant(participantId: string) {
  const user = await actor();
  if (!user || !OpcoIdSchema.safeParse(participantId).success) return [];
  return prisma.opcoSubmission.findMany({
    where: { participantId, tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
}
export async function getOpcoSubmission(id: string) {
  const user = await actor();
  if (!user || !OpcoIdSchema.safeParse(id).success) return null;
  const sub = await prisma.opcoSubmission.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      participant: {
        include: {
          person: {
            include: {
              legalLinks: { include: { organization: { include: { ageficeProfile: true } } } },
            },
          },
          session: { include: { product: true } },
          sponsorOrg: { include: { ageficeProfile: true } },
        },
      },
      sponsorOrg: true,
    },
  });
  if (!sub) return null;
  const company = isCompanyDossier(sub.participant);
  const agefice = !company && estEligibleAgefice(sub.participant);
  const built =
    agefice || company
      ? await buildOpcoSubmission(
          sub.participantId,
          user,
          sub.stage === 'FIN_FORMATION' ? 'FIN_FORMATION' : 'PRISE_EN_CHARGE',
        )
      : null;
  return {
    ...sub,
    // L'aperçu relit les pièces courantes, y compris le programme catalogue.
    // Enregistrer/Envoyer persiste ensuite cet aperçu avant le contrôle serveur.
    ...(sub.status === 'DRAFT' && sub.deliveryState === 'READY' && built?.ok
      ? {
          attachments: built.attachments.map((a) => ({
            ...a,
            included:
              (sub.attachments as unknown as SubmissionAttachment[]).find(
                (old) => old.kind === a.kind && old.key === a.key,
              )?.included ?? a.included,
          })),
          ...(sub.stage === 'FIN_FORMATION' ? { recipientEmail: built.recipientEmail } : {}),
        }
      : {}),
    stage:
      sub.stage === 'FIN_FORMATION' ? ('FIN_FORMATION' as const) : ('PRISE_EN_CHARGE' as const),
    deliveryState:
      sub.deliveryState === 'READY'
        ? ('READY' as const)
        : sub.deliveryState === 'SENDING'
          ? ('SENDING' as const)
          : ('UNCERTAIN' as const),
    agefice,
    company,
    department: built?.ok ? built.routing.department : null,
    pointAccueilId: built?.ok ? (built.routing.selected?.id ?? null) : null,
    pointAccueilOptions: built?.ok
      ? built.routing.options.map((p) => ({ id: p.id, name: p.name, email: p.email }))
      : [],
  };
}
export async function updateOpcoSubmissionDraft(
  id: string,
  patch: {
    subject?: string;
    bodyHtml?: string;
    recipientEmail?: string;
    attachments?: SubmissionAttachment[];
  },
): Promise<{ ok: boolean; error?: string }> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  const parsed = OpcoDraftPatchSchema.safeParse(patch);
  if (!OpcoIdSchema.safeParse(id).success || !parsed.success)
    return { ok: false, error: 'Adresse email, objet ou message invalide.' };
  const sub = await prisma.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!sub || sub.status !== 'DRAFT' || sub.deliveryState !== 'READY')
    return { ok: false, error: 'Ce dossier ne peut plus être modifié.' };
  const stored = sub.attachments as unknown as SubmissionAttachment[];
  // Le client ne choisit que included. L’aperçu courant peut contenir une
  // nouvelle pièce arrivée depuis la création du brouillon : on la valide
  // contre les sources serveur, jamais contre une clé fournie seule.
  const incoming = parsed.data.attachments;
  const matches = (source: SubmissionAttachment[]) =>
    incoming &&
    incoming.length === source.length &&
    new Set(incoming.map((a) => a.kind + ':' + a.key)).size === incoming.length &&
    incoming.every((a) =>
      source.some(
        (b) =>
          b.key === a.key && b.kind === a.kind && b.filename === a.filename && b.signe === a.signe,
      ),
    );
  let source = stored;
  if (incoming && !matches(source)) {
    const built = await buildOpcoSubmission(
      sub.participantId,
      user,
      sub.stage === 'FIN_FORMATION' ? 'FIN_FORMATION' : 'PRISE_EN_CHARGE',
    );
    if (!built.ok) return built;
    source = built.attachments;
    if (!matches(source)) return { ok: false, error: 'Pièces modifiées : actualisez le dossier.' };
  }
  const attachments = incoming
    ? source.map((a) => ({
        ...a,
        included: incoming.find((b) => b.key === a.key && b.kind === a.kind)!.included,
      }))
    : stored;
  if (
    (parsed.data.subject ?? sub.subject) === sub.subject &&
    (parsed.data.bodyHtml ?? sub.bodyHtml) === sub.bodyHtml &&
    (parsed.data.recipientEmail ?? sub.recipientEmail) === sub.recipientEmail &&
    JSON.stringify(attachments) === JSON.stringify(stored)
  )
    return { ok: true };
  const changed = await prisma.$transaction(async (tx) => {
    const result = await tx.opcoSubmission.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        status: 'DRAFT',
        deliveryState: 'READY',
        updatedAt: sub.updatedAt,
      },
      data: { ...parsed.data, attachments: attachments as unknown as Prisma.InputJsonValue },
    });
    if (result.count)
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'OpcoSubmission',
          entityId: id,
          action: 'opco.draft_updated',
          diff: { fields: Object.keys(parsed.data) },
        },
      });
    return result.count;
  });
  invalidate(undefined, id);
  return changed ? { ok: true } : { ok: false, error: 'Le dossier a changé. Rechargez la page.' };
}

/** Reprise explicite après contrôle de la boîte mail, réservée à l'administration. */
export async function resolveOpcoDelivery(
  id: string,
  resolution: 'SENT' | 'RETRY',
): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch {
    return { ok: false, error: 'Accès refusé' };
  }
  if (!OpcoIdSchema.safeParse(id).success || !['SENT', 'RETRY'].includes(resolution))
    return { ok: false, error: 'Décision invalide' };
  const sub = await prisma.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!sub || sub.status !== 'DRAFT' || sub.deliveryState === 'READY')
    return { ok: false, error: 'Aucun envoi à rapprocher' };
  if (sub.sendingStartedAt && Date.now() - sub.sendingStartedAt.getTime() < 10 * 60_000)
    return {
      ok: false,
      error: 'Attendez dix minutes avant de reprendre un envoi pour éviter de le doubler.',
    };
  const changed = await prisma.$transaction(async (tx) => {
    const r = await tx.opcoSubmission.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        status: 'DRAFT',
        deliveryState: sub.deliveryState,
        updatedAt: sub.updatedAt,
      },
      data: {
        deliveryState: 'READY',
        sendingStartedAt: null,
        lastError: null,
        ...(resolution === 'SENT'
          ? {
              status: 'SENT',
              sentAt: new Date(),
              internalNotes: 'Envoi confirmé manuellement après vérification de la messagerie.',
            }
          : {}),
      },
    });
    if (r.count)
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'OpcoSubmission',
          entityId: id,
          action: 'opco.delivery_reconciled',
          diff: { before: sub.deliveryState, resolution, manualVerification: true },
        },
      });
    return r.count;
  });
  invalidate(undefined, id);
  return changed ? { ok: true } : { ok: false, error: 'Le dossier a changé, rechargez la page.' };
}

export async function selectOpcoPointAccueil(
  id: string,
  pointAccueilId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  if (!OpcoIdSchema.safeParse(id).success || !OpcoIdSchema.safeParse(pointAccueilId).success)
    return { ok: false, error: 'Point d’accueil invalide' };
  const sub = await prisma.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!sub || sub.status !== 'DRAFT' || sub.deliveryState !== 'READY')
    return { ok: false, error: 'Brouillon indisponible' };
  const stage = DossierStageSchema.safeParse(sub.stage);
  if (!stage.success) return { ok: false, error: 'Étape invalide' };
  if (stage.data === 'FIN_FORMATION')
    return { ok: false, error: 'Le destinataire du remboursement est celui de l’envoi initial.' };
  const built = await buildOpcoSubmission(sub.participantId, user, stage.data);
  if (!built.ok) return built;
  const choice = built.routing.options.find((p) => p.id === pointAccueilId && !!p.email);
  if (!built.agefice || !built.profileId || !choice)
    return { ok: false, error: 'Choisissez un point couvrant le département vérifié sur la CFP.' };
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.opcoSubmission.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        status: 'DRAFT',
        deliveryState: 'READY',
        updatedAt: sub.updatedAt,
      },
      data: { recipientEmail: choice.email },
    });
    if (!updated.count) return false;
    await tx.ageficeProfile.updateMany({
      where: { id: built.profileId!, organization: { tenantId: user.tenantId } },
      data: { pointAccueilId: choice.id, pointAccueilLockedManually: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'AgeficeProfile',
        entityId: built.profileId!,
        action: 'agefice.point_selected',
        diff: {
          before: built.routing.selected?.id ?? null,
          after: choice.id,
          department: built.routing.department,
        },
      },
    });
    return true;
  });
  invalidate(built.participant.sessionId, id);
  return changed ? { ok: true } : { ok: false, error: 'Le dossier a changé, rechargez la page.' };
}

/** L'utilisateur recopie le code postal de l'entreprise après lecture de la CFP. */
export async function confirmOpcoCfpPostalCode(
  id: string,
  postalCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await actor();
  if (!user) return { ok: false, error: 'Accès refusé' };
  const code = CfpPostalCodeSchema.safeParse(postalCode);
  if (!OpcoIdSchema.safeParse(id).success || !code.success)
    return { ok: false, error: 'Saisissez les cinq chiffres du code postal figurant sur la CFP.' };
  const sub = await prisma.opcoSubmission.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!sub || sub.status !== 'DRAFT' || sub.deliveryState !== 'READY')
    return { ok: false, error: 'Brouillon indisponible' };
  const stage = DossierStageSchema.safeParse(sub.stage);
  if (!stage.success) return { ok: false, error: 'Étape inconnue' };
  if (stage.data === 'FIN_FORMATION')
    return { ok: false, error: 'Le destinataire du remboursement est celui de l’envoi initial.' };
  const built = await buildOpcoSubmission(sub.participantId, user, stage.data);
  if (!built.ok) return built;
  if (!built.agefice || !built.profileId)
    return { ok: false, error: 'Complétez d’abord le profil AGEFICE de l’entreprise.' };
  const changed = await prisma.$transaction(async (tx) => {
    const profile = await tx.ageficeProfile.findFirst({
      where: { id: built.profileId!, organization: { tenantId: user.tenantId } },
    });
    if (!profile) return false;
    const fields =
      profile.paFields && typeof profile.paFields === 'object' && !Array.isArray(profile.paFields)
        ? profile.paFields
        : {};
    if (fields['Code Postal (Entreprise)'] === code.data) return true;
    const updated = await tx.opcoSubmission.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        status: 'DRAFT',
        deliveryState: 'READY',
        updatedAt: sub.updatedAt,
      },
      data: { recipientEmail: null },
    });
    if (!updated.count) return false;
    await tx.ageficeProfile.updateMany({
      where: { id: profile.id, organization: { tenantId: user.tenantId } },
      data: {
        paFields: { ...fields, 'Code Postal (Entreprise)': code.data },
        pointAccueilId: null,
        pointAccueilLockedManually: false,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'AgeficeProfile',
        entityId: profile.id,
        action: 'agefice.cfp_postal_confirmed',
        diff: {
          field: 'Code Postal (Entreprise)',
          source: 'CFP vérifiée par utilisateur',
          previousPointAccueilId: profile.pointAccueilId,
        },
      },
    });
    return true;
  });
  invalidate(built.participant.sessionId, id);
  return changed ? { ok: true } : { ok: false, error: 'Le dossier a changé, rechargez la page.' };
}
