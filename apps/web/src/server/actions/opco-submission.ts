'use server';

/**
 * Envoi automatisé du dossier OPCO complet (US-4 backlog).
 *
 * Flow : composeOpcoSubmission(participantId) → DRAFT avec PJ + body
 *      → UI prévisu /app/dossiers-opco/[id]/envoyer
 *      → sendOpcoSubmission(id) → SMTP nodemailer → SENT
 *      → suivi manuel : markOpcoSubmissionStatus → APPROVED|REJECTED|REIMBURSED
 *      → relances auto cron (étape E) si SENT > 30j
 *
 * Synchronisation timeline OPCO existante (SessionParticipant.opcoApproved/
 * Reimbursed) : automatique au passage à APPROVED / REIMBURSED.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma, type OpcoSubmissionStatus } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { sendMail } from '@/lib/mailer';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { groupConventionWhere } from '@/lib/docs/convention-coverage';

export interface SubmissionAttachment {
  /** clé MinIO du fichier */
  key: string;
  filename: string;
  /** kind = DocType-like pour la sémantique métier */
  kind: 'CNI' | 'RIB' | 'CFP_ATTESTATION' | 'AGEFICE_PA_FORM' | 'CONVENTION' | 'PROGRAMME' | 'OTHER';
  /** Inclure (true par défaut) ou non dans l'envoi */
  included: boolean;
}

export interface ComposeResult {
  ok: boolean;
  submissionId?: string;
  /** Pièces présentes (attachments[].included === true par défaut) */
  attachments?: SubmissionAttachment[];
  /** Pièces manquantes (à ajouter manuellement avant envoi) */
  missing?: SubmissionAttachment['kind'][];
  error?: string;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/**
 * Compose un dossier OPCO complet pour un SessionParticipant. Crée un
 * OpcoSubmission status=DRAFT prêt à éditer dans l'UI prévisu.
 */
export async function composeOpcoSubmission(
  participantId: string,
): Promise<ComposeResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: { include: { sensitiveData: true } },
      sponsorOrg: { include: { ageficeProfile: true } },
      session: { include: { product: true } },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  // Récupération des PJ disponibles
  const attachments: SubmissionAttachment[] = [];
  const missing: SubmissionAttachment['kind'][] = [];

  // CNI : SensitiveData
  if (participant.person.sensitiveData?.idDocumentUrl) {
    attachments.push({
      key: participant.person.sensitiveData.idDocumentUrl,
      filename: `CNI_${participant.person.lastName}_${participant.person.firstName}.pdf`,
      kind: 'CNI',
      included: true,
    });
  } else {
    missing.push('CNI');
  }

  // RIB : Person.ribKey
  if (participant.person.ribKey) {
    attachments.push({
      key: participant.person.ribKey,
      filename: `RIB_${participant.person.lastName}_${participant.person.firstName}.pdf`,
      kind: 'RIB',
      included: true,
    });
  } else {
    missing.push('RIB');
  }

  // CFP attestation : AgeficeProfile.cfpAttestationKey (lié au sponsor)
  if (participant.sponsorOrg.ageficeProfile?.cfpAttestationKey) {
    attachments.push({
      key: participant.sponsorOrg.ageficeProfile.cfpAttestationKey,
      filename: `Attestation_CFP_${participant.person.lastName}.pdf`,
      kind: 'CFP_ATTESTATION',
      included: true,
    });
  } else {
    missing.push('CFP_ATTESTATION');
  }

  // Documents générés (Convention, Programme, PDF AGEFICE)
  const docs = await prisma.document.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { participantId: participant.id, type: { in: ['CONVENTION', 'AGEFICE'] } },
        { sessionId: participant.session.id, type: 'PROGRAMME' },
        // Convention GROUPE (revue Codex PR #13) : pour un salarié couvert par
        // la convention de son entreprise, le document n'a PAS de participantId.
        // Sans cette branche, le dossier OPCO déclarait « CONVENTION manquante »
        // et n'attachait pas le PDF — exactement le scénario OPTIMMO / OPCO EP
        // que la convention groupe devait servir.
        groupConventionWhere(user.tenantId, participant.session.id, participant.sponsorOrgId),
      ],
    },
    select: { type: true, pdfUrl: true, participantId: true },
    orderBy: { createdAt: 'desc' },
  });

  const conventionDocs = docs.filter((d) => d.type === 'CONVENTION');
  // Priorité à la convention individuelle quand les deux coexistent
  // (transition : une individuelle émise avant la bascule en groupe).
  const conventionDoc =
    conventionDocs.find((d) => d.participantId === participant.id) ?? conventionDocs[0];
  const ageficeDoc = docs.find((d) => d.type === 'AGEFICE');
  const programmeDoc = docs.find((d) => d.type === 'PROGRAMME');

  if (conventionDoc) {
    attachments.push({
      key: conventionDoc.pdfUrl,
      filename: `Convention_${participant.session.code ?? 'session'}.pdf`,
      kind: 'CONVENTION',
      included: true,
    });
  } else {
    missing.push('CONVENTION');
  }

  if (programmeDoc) {
    attachments.push({
      key: programmeDoc.pdfUrl,
      filename: `Programme_${participant.session.code ?? 'session'}.pdf`,
      kind: 'PROGRAMME',
      included: true,
    });
  } else {
    missing.push('PROGRAMME');
  }

  if (ageficeDoc) {
    attachments.push({
      key: ageficeDoc.pdfUrl,
      filename: `AGEFICE_PA_${participant.person.lastName}.pdf`,
      kind: 'AGEFICE_PA_FORM',
      included: true,
    });
  } else {
    missing.push('AGEFICE_PA_FORM');
  }

  // Email destinataire
  const recipientEmail =
    participant.sponsorOrg.emailBilling ?? participant.sponsorOrg.email ?? null;

  // Subject + body défaut
  const opcoCode = participant.sponsorOrg.opcoCode ?? 'OPCO';
  const subject = `Dossier de prise en charge ${opcoCode} — ${participant.person.firstName} ${participant.person.lastName.toUpperCase()} — ${participant.session.code ?? participant.session.product.title}`;

  const dureeHeures = participant.session.product.durationHours;
  const dateDebut = fmtDate.format(participant.session.startDate);
  const dateFin = fmtDate.format(participant.session.endDate);
  const montantHT = Number(participant.priceHT).toFixed(2);

  const bodyHtml = `<p>Bonjour,</p>
<p>Veuillez trouver ci-joint le dossier complet de demande de prise en charge ${opcoCode} pour :</p>
<ul>
  <li><strong>Stagiaire :</strong> ${participant.person.firstName} ${participant.person.lastName.toUpperCase()}</li>
  <li><strong>Formation :</strong> ${participant.session.product.title}</li>
  <li><strong>Code session :</strong> ${participant.session.code ?? '—'}</li>
  <li><strong>Dates :</strong> du ${dateDebut} au ${dateFin}</li>
  <li><strong>Durée :</strong> ${dureeHeures}h</li>
  <li><strong>Montant HT :</strong> ${montantHT} €</li>
</ul>
<p>Pièces jointes :</p>
<ul>
${attachments
  .map((a) => `  <li>${ATTACHMENT_LABELS[a.kind]} : <code>${a.filename}</code></li>`)
  .join('\n')}
</ul>
${
  missing.length > 0
    ? `<p style="color:#b45309"><em>⚠ Pièces manquantes à compléter avant envoi : ${missing.map((m) => ATTACHMENT_LABELS[m]).join(', ')}</em></p>`
    : ''
}
<p>Restant à votre disposition pour toute information complémentaire.</p>
<p>Cordialement,<br/>${user.firstName ?? ''} ${user.lastName ?? ''}<br/>Start Academy</p>`;

  const submission = await prisma.opcoSubmission.create({
    data: {
      tenantId: user.tenantId,
      participantId: participant.id,
      sponsorOrgId: participant.sponsorOrg.id,
      status: 'DRAFT',
      recipientEmail,
      subject,
      bodyHtml,
      attachments: attachments as unknown as Prisma.InputJsonValue,
      createdById: user.id,
    },
  });

  revalidatePath('/app/dossiers-opco');
  return {
    ok: true,
    submissionId: submission.id,
    attachments,
    missing,
  };
}

const ATTACHMENT_LABELS: Record<SubmissionAttachment['kind'], string> = {
  CNI: 'Carte d\'identité',
  RIB: 'RIB',
  CFP_ATTESTATION: 'Attestation CFP URSSAF',
  AGEFICE_PA_FORM: 'Formulaire AGEFICE PA pré-rempli',
  CONVENTION: 'Convention de formation',
  PROGRAMME: 'Programme pédagogique',
  OTHER: 'Autre',
};

/**
 * Envoie un OpcoSubmission DRAFT via SMTP nodemailer. Bascule status=SENT.
 */
export async function sendOpcoSubmission(
  submissionId: string,
): Promise<{ ok: boolean; error?: string; dryRun?: boolean }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const sub = await prisma.opcoSubmission.findFirst({
    where: { id: submissionId, tenantId: user.tenantId },
    include: { participant: { select: { sessionId: true } } },
  });
  if (!sub) return { ok: false, error: 'Dossier introuvable' };
  if (sub.status !== 'DRAFT') return { ok: false, error: `Statut ${sub.status} — déjà envoyé ou clos` };
  if (!sub.recipientEmail) return { ok: false, error: 'Pas d\'email destinataire (à renseigner sur l\'organisation sponsor : emailBilling ou email)' };
  if (!sub.subject || !sub.bodyHtml) return { ok: false, error: 'Subject ou corps vide' };

  const attachments = (sub.attachments as unknown as SubmissionAttachment[]).filter((a) => a.included);
  if (attachments.length === 0) return { ok: false, error: 'Aucune pièce jointe à envoyer' };

  // Récupère les bytes des PJ depuis MinIO
  const mailAttachments = await Promise.all(
    attachments.map(async (a) => ({
      filename: a.filename,
      content: await downloadFile(DOCS_BUCKET, a.key),
    })),
  );

  const result = await sendMail({
    to: sub.recipientEmail,
    subject: sub.subject,
    html: sub.bodyHtml,
    attachments: mailAttachments,
    context: {
      tenantId: user.tenantId,
      category: 'opco_submission',
      sessionId: sub.participant.sessionId,
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Échec envoi SMTP' };
  }

  await prisma.opcoSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      threadId: result.messageId ?? null,
    },
  });

  revalidatePath('/app/dossiers-opco');
  return { ok: true, dryRun: result.dryRun };
}

/**
 * Bascule manuelle du statut (Laurent valide depuis la liste OPCO :
 * ACK_RECEIVED, APPROVED, REJECTED, REIMBURSED, CANCELED). Synchronise la
 * timeline OPCO 4-étapes pour APPROVED et REIMBURSED.
 */
export async function markOpcoSubmissionStatus(
  submissionId: string,
  next: OpcoSubmissionStatus,
  notes?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const sub = await prisma.opcoSubmission.findFirst({
    where: { id: submissionId, tenantId: user.tenantId },
    select: { id: true, participantId: true, status: true },
  });
  if (!sub) return { ok: false, error: 'Dossier introuvable' };

  const now = new Date();
  const data: Prisma.OpcoSubmissionUpdateInput = {
    status: next,
    ...(notes ? { internalNotes: notes } : {}),
  };
  if (next === 'ACK_RECEIVED') data.ackAt = now;
  if (next === 'APPROVED') data.approvedAt = now;
  if (next === 'REJECTED') data.rejectedAt = now;
  if (next === 'REIMBURSED') data.reimbursedAt = now;

  await prisma.$transaction(async (tx) => {
    await tx.opcoSubmission.update({ where: { id: sub.id }, data });
    // Synchro timeline OPCO 4-étapes
    if (next === 'APPROVED') {
      await tx.sessionParticipant.update({
        where: { id: sub.participantId },
        data: { opcoApproved: true, opcoApprovedAt: now },
      });
    }
    if (next === 'REIMBURSED') {
      await tx.sessionParticipant.update({
        where: { id: sub.participantId },
        data: { opcoReimbursed: true, opcoReimbursedAt: now },
      });
    }
  });

  revalidatePath('/app/dossiers-opco');
  return { ok: true };
}

/**
 * Liste les submissions d'un participant (historique : drafts + envoyés).
 */
export async function listOpcoSubmissionsForParticipant(participantId: string) {
  const { user } = await validateRequest();
  if (!user) return [];
  return prisma.opcoSubmission.findMany({
    where: { participantId, tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Récupère un submission précis (pour l'UI prévisu).
 */
export async function getOpcoSubmission(id: string) {
  const { user } = await validateRequest();
  if (!user) return null;
  return prisma.opcoSubmission.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      participant: {
        include: {
          person: true,
          session: { include: { product: true } },
        },
      },
      sponsorOrg: true,
    },
  });
}

/**
 * Update du draft (subject, body, attachments cochées) avant envoi.
 */
export async function updateOpcoSubmissionDraft(
  id: string,
  patch: { subject?: string; bodyHtml?: string; recipientEmail?: string; attachments?: SubmissionAttachment[] },
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  const sub = await prisma.opcoSubmission.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { status: true },
  });
  if (!sub) return { ok: false, error: 'Dossier introuvable' };
  if (sub.status !== 'DRAFT') return { ok: false, error: 'Modifiable uniquement en mode brouillon' };

  await prisma.opcoSubmission.update({
    where: { id },
    data: {
      subject: patch.subject,
      bodyHtml: patch.bodyHtml,
      recipientEmail: patch.recipientEmail,
      ...(patch.attachments
        ? { attachments: patch.attachments as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  revalidatePath('/app/dossiers-opco');
  return { ok: true };
}
