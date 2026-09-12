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
import { groupConventionAnyShapeWhere } from '@/lib/docs/convention-coverage';
import { nomFichierCertificat } from '@/lib/signature/certificat-signature';
import {
  LIBELLES_PIECE_DOSSIER,
  messageDossierIncomplet,
  piecesNonSignees,
  versionAJoindre,
  type KindPieceDossier,
} from '@/lib/opco/pieces-dossier';
import { resoudreDestinataireDossier } from '@/lib/opco/destinataire-dossier';

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
   * AVANT le lot D n'en portent pas — absent vaut « on ne sait pas », donc
   * jamais bloquant rétroactivement sur un brouillon déjà préparé.
   */
  signe?: boolean;
}

export interface ComposeResult {
  ok: boolean;
  submissionId?: string;
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
      // Lot D : le POINT D'ACCUEIL rattaché. C'est lui le destinataire d'un
      // dossier AGEFICE — le commanditaire, lui, est l'entreprise du stagiaire.
      sponsorOrg: { include: { ageficeProfile: { include: { pointAccueil: true } } } },
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
      // Ne se signe pas : dire `false` serait faux, dire `true` le serait aussi.
      signe: false,
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
      // Ne se signe pas : dire `false` serait faux, dire `true` le serait aussi.
      signe: false,
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
      // Ne se signe pas : dire `false` serait faux, dire `true` le serait aussi.
      signe: false,
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
        // Quick 260821-md8 : les DEUX formes de stockage, sinon le dossier OPCO
        // EP d'ASSALIT / EXPERTA repart sans sa convention (elle y existe sous
        // la forme `session`, produite par script).
        groupConventionAnyShapeWhere(
          user.tenantId,
          participant.session.id,
          participant.sponsorOrgId,
        ),
      ],
    },
    select: {
      type: true,
      pdfUrl: true,
      participantId: true,
      // Lot D — règle métier n°2 : le PDF signé fait foi. Jusqu'ici le dossier
      // partait avec la convention VIERGE alors que la signée existait à côté.
      signedPdfUrl: true,
      // Règle métier n°3 : le certificat est une pièce à part entière, et c'est
      // ce que les AGEFICE réclament. Il appartient à la DEMANDE, pas au
      // document — jointure, pas requête de plus.
      signatureRequest: { select: { id: true, auditTrailUrl: true } },
    },
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
    const version = versionAJoindre(conventionDoc);
    attachments.push({
      key: version.key,
      filename: `Convention_${participant.session.code ?? 'session'}.pdf`,
      kind: 'CONVENTION',
      included: true,
      signe: version.signe,
    });
  } else {
    missing.push('CONVENTION');
  }

  if (programmeDoc) {
    const version = versionAJoindre(programmeDoc);
    attachments.push({
      key: version.key,
      filename: `Programme_${participant.session.code ?? 'session'}.pdf`,
      kind: 'PROGRAMME',
      included: true,
      signe: version.signe,
    });
  } else {
    missing.push('PROGRAMME');
  }

  if (ageficeDoc) {
    const version = versionAJoindre(ageficeDoc);
    attachments.push({
      key: version.key,
      filename: `AGEFICE_PA_${participant.person.lastName}.pdf`,
      kind: 'AGEFICE_PA_FORM',
      included: true,
      signe: version.signe,
    });
  } else {
    missing.push('AGEFICE_PA_FORM');
  }

  // ── Les CERTIFICATS de signature — règle métier n°3 ─────────────────────
  //
  // UN PAR DEMANDE, pas un par pièce : une demande peut porter plusieurs
  // documents, et son certificat les couvre tous. Le joindre deux fois mettrait
  // deux pièces jointes identiques dans le mail du financeur.
  //
  // L'ORDRE suit celui des pièces du dossier (convention, puis AGEFICE) : c'est
  // l'ordre dans lequel un instructeur les dépile.
  const certificatsVus = new Set<string>();
  for (const source of [conventionDoc, ageficeDoc]) {
    const demande = source?.signatureRequest ?? null;
    const cle = (demande?.auditTrailUrl ?? '').trim();
    if (demande === null || cle.length === 0) continue;
    if (certificatsVus.has(demande.id)) continue;
    certificatsVus.add(demande.id);
    attachments.push({
      key: cle,
      // Le MÊME nom que celui servi par `/api/signature-requests/[id]/audit-trail` :
      // l'admin retrouve dans le mail du financeur le fichier qu'il a téléchargé.
      filename: nomFichierCertificat({
        docType: source?.type,
        firstName: participant.person.firstName,
        lastName: participant.person.lastName,
        sessionCode: participant.session.code,
      }),
      kind: 'AUDIT_TRAIL',
      included: true,
      // Le certificat n'est pas « signé » : il EST la preuve de la signature.
      signe: false,
    });
  }

  // ── Le DESTINATAIRE — lot D ─────────────────────────────────────────────
  //
  // Un dossier AGEFICE se dépose auprès d'un POINT D'ACCUEIL, pas auprès du
  // commanditaire : celui-ci est l'entreprise individuelle du stagiaire, et
  // l'application proposait donc de lui envoyer son propre dossier. La règle
  // vit dans `resoudreDestinataireDossier`, sous test unitaire — sans repli
  // silencieux sur l'entreprise, parce qu'un envoi parti au mauvais endroit ne
  // se rattrape pas.
  const destinataire = resoudreDestinataireDossier({
    opcoCode: participant.sponsorOrg.opcoCode,
    pointAccueil: participant.sponsorOrg.ageficeProfile?.pointAccueil ?? null,
    emailBilling: participant.sponsorOrg.emailBilling,
    email: participant.sponsorOrg.email,
  });
  const recipientEmail = destinataire.email;

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
    avertissementDestinataire: destinataire.motif,
    nonSignees: piecesNonSignees(
      attachments.map((a) => ({ kind: a.kind, signe: a.signe === true })),
    ),
  };
}

/**
 * Les libellés viennent du module du dossier — ils servent aussi au message de
 * refus et à l'écran. Trois copies finiraient par se contredire sous les yeux
 * du financeur.
 */
const ATTACHMENT_LABELS = LIBELLES_PIECE_DOSSIER;

/**
 * Envoie un OpcoSubmission DRAFT via SMTP nodemailer. Bascule status=SENT.
 */
export async function sendOpcoSubmission(
  submissionId: string,
  options: {
    /**
     * Lot D — envoyer MALGRÉ une pièce non signée. C'est une DÉCISION, pas un
     * contournement : réservée à ADMIN, comme les autres dérogations du
     * chantier signature (la saisie d'adresse au récapitulatif d'envoi).
     */
    force?: boolean;
  } = {},
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

  // ── JAMAIS D'ENVOI PARTIEL SILENCIEUX (lot D) ───────────────────────────
  //
  // Une convention non signée dans un dossier de financement, c'est un dossier
  // refusé — et refusé des semaines plus tard, quand la session est passée. Le
  // refus est NOMINATIF : il dit quelle pièce, et les deux gestes qui la
  // corrigent.
  //
  // `signe` absent vaut « on ne sait pas » : les brouillons composés AVANT ce
  // lot ne portent pas l'information, et les bloquer rétroactivement
  // immobiliserait des dossiers déjà préparés.
  const nonSignees = piecesNonSignees(
    attachments.filter((a) => a.signe !== undefined).map((a) => ({ kind: a.kind, signe: a.signe === true })),
  );
  if (nonSignees.length > 0) {
    if (options.force !== true) {
      return { ok: false, error: messageDossierIncomplet(nonSignees) };
    }
    if (user.role !== 'ADMIN') {
      return {
        ok: false,
        error:
          `${messageDossierIncomplet(nonSignees)} Seul un ADMIN peut décider d’envoyer ` +
          'un dossier incomplet.',
      };
    }
  }

  // Récupère les bytes des PJ depuis MinIO
  const mailAttachments = await Promise.all(
    attachments.map(async (a) => ({
      filename: a.filename,
      content: await downloadFile(DOCS_BUCKET, a.key),
    })),
  );

  // Lot 0 · 0.2 — quels `Document` partent réellement dans ce mail. Le dossier
  // ne référence que des clés de stockage : on remonte aux ids pour que la
  // trace d'envoi soit exploitable (règle « document engagé »). Les pièces sans
  // ligne Document (CNI / RIB / CFP) ne résolvent rien, et c'est normal.
  //
  // ⚠ LES DEUX CLÉS, depuis le lot D. La recherche ne portait que sur `pdfUrl` ;
  // depuis que les pièces partent dans leur version SIGNÉE, aucune clé ne
  // correspondait plus et la trace se vidait EN SILENCE — on n'aurait jamais su
  // quelle version était partie chez le financeur.
  const clesJointes = attachments.map((a) => a.key);
  const joinedDocuments = await prisma.document.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [{ pdfUrl: { in: clesJointes } }, { signedPdfUrl: { in: clesJointes } }],
    },
    select: { id: true },
  });

  const result = await sendMail({
    to: sub.recipientEmail,
    // L'EXPÉDITEUR EN COPIE (Laurent, 10/09) : « le mail arrive aussi dans sa
    // boîte, avec les pièces ». Pas un `mailto:` — il ne joint pas de fichiers
    // de façon fiable — et pas un second envoi, qui doublerait la trace.
    ...(user.email ? { cc: user.email } : {}),
    subject: sub.subject,
    html: sub.bodyHtml,
    attachments: mailAttachments,
    context: {
      tenantId: user.tenantId,
      category: 'opco_submission',
      sessionId: sub.participant.sessionId,
      documentIds: joinedDocuments.map((d) => d.id),
      relatedEntity: `opcoSubmission:${sub.id}`,
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
