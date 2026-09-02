/**
 * Lot 0 · 0.2 — « ce document est-il déjà engagé ? »
 *
 * Le trou que ce module ferme (audit du 28/08) : entre « document dormant »
 * (jamais sorti de l'outil, régénération anodine) et « document contractuel »
 * (convention signée), il existait un état invisible — ENVOYÉ MAIS PAS ENCORE
 * SIGNÉ. Rien dans l'application ne disait qu'un PDF avait quitté la maison, si
 * bien que régénérer une convention déjà partie chez un financeur ne
 * déclenchait aucun signal, et que le destinataire gardait une version que
 * l'outil croyait obsolète.
 *
 * Trois preuves qu'un document est sorti, par ordre de dureté :
 *  1. il est cité dans un `EmailMessage.documentIds` (il est parti, on sait quand
 *     et à qui) ;
 *  2. sa clé de stockage figure dans les pièces jointes d'un dossier financeur
 *     non-DRAFT (le dossier est parti) ;
 *  3. il est signé — `conventionSigned`, ou une preuve signée téléversée /
 *     cochée dans `docStatus`.
 *
 * Et un aveu, qui est le point important : les envois ANTÉRIEURS au 02/09/2026
 * n'ont laissé aucune trace, parce que la colonne n'existait pas. Pour ces
 * documents-là on ne dit pas « libre » — on dit « il a PU être envoyé », et on
 * laisse l'humain trancher. Une fausse assurance coûterait plus cher qu'un
 * avertissement de trop.
 *
 * La classification est PURE (`classifyDocumentEngagement`) ; la lecture BDD est
 * isolée dans `getDocumentEngagement`.
 */

import { prisma } from '@qualiof/db';
import { groupConventionAnyShapeWhere } from './convention-coverage';

/**
 * Date à partir de laquelle le mailer écrit `EmailMessage.documentIds`.
 * DOIT correspondre à la migration `20260902120000_email_message_document_ids`.
 * Avant elle, l'absence de trace ne prouve rien.
 */
export const EMAIL_TRACKING_SINCE = new Date('2026-09-02T00:00:00.000Z');

export type EngagementLevel = 'FREE' | 'MAYBE_SENT' | 'ENGAGED';

export interface DocumentEngagement {
  level: EngagementLevel;
  /** Formulations prêtes à afficher, dans l'ordre de gravité. */
  reasons: string[];
}

export interface EngagementFacts {
  docType: string;
  createdAt: Date;
  /** Envois tracés qui portaient CE document. */
  emailSends: { sentAt: Date | null }[];
  /** Dossiers financeur non-DRAFT dont les pièces jointes contiennent ce PDF. */
  submissionsWithDoc: { status: string; sentAt: Date | null }[];
  /** `SessionParticipant.conventionSigned`. */
  conventionSigned: boolean;
  /** `docStatus[docType].state === 'MANUAL_OK'` — preuve signée téléversée ou cochée. */
  manuallyValidated: boolean;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function dateOuPas(d: Date | null): string {
  return d ? ` le ${fmtDate.format(d)}` : '';
}

export function classifyDocumentEngagement(facts: EngagementFacts): DocumentEngagement {
  const reasons: string[] = [];

  for (const send of facts.emailSends) {
    reasons.push(`envoyé par email${dateOuPas(send.sentAt)}`);
  }
  for (const sub of facts.submissionsWithDoc) {
    reasons.push(`parti dans un dossier financeur${dateOuPas(sub.sentAt)} (statut ${sub.status})`);
  }
  if (facts.docType === 'CONVENTION' && facts.conventionSigned) {
    reasons.push('convention marquée signée sur l’inscription');
  }
  if (facts.manuallyValidated) {
    reasons.push('une preuve signée a été téléversée ou cochée');
  }

  if (reasons.length > 0) return { level: 'ENGAGED', reasons };

  if (facts.createdAt < EMAIL_TRACKING_SINCE) {
    return {
      level: 'MAYBE_SENT',
      reasons: [
        `produit avant le suivi des envois (${fmtDate.format(EMAIL_TRACKING_SINCE)}) : l’application ne peut pas dire s’il a été envoyé`,
      ],
    };
  }

  return { level: 'FREE', reasons: [] };
}

/**
 * Phrase d'avertissement affichée avant de remplacer ou supprimer le document.
 * `null` = rien à signaler, l'action peut partir sans confirmation.
 */
export function engagementWarning(
  engagement: DocumentEngagement,
  action: 'regenerate' | 'delete',
): string | null {
  if (engagement.level === 'FREE') return null;
  const motifs = engagement.reasons.join(' · ');
  const verbe = action === 'delete' ? 'Le supprimer' : 'Le remplacer';

  if (engagement.level === 'ENGAGED') {
    return `Ce document est engagé : ${motifs}. ${verbe} ne change rien chez le destinataire, qui garde la version qu'il a reçue — il faut un avenant ou un nouveau dossier. Continuer quand même ?`;
  }
  return `Ce document a pu être envoyé : ${motifs}. Vérifiez avant de ${action === 'delete' ? 'le supprimer' : 'le remplacer'}. Continuer ?`;
}

/** Lit les faits en base pour UN document, puis classe. */
export async function getDocumentEngagement(
  tenantId: string,
  documentId: string,
): Promise<DocumentEngagement | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true, type: true, createdAt: true, pdfUrl: true, participantId: true },
  });
  if (!doc) return null;

  const [emailSends, participant, submissions] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { tenantId, documentIds: { array_contains: [doc.id] } },
      select: { sentAt: true },
      orderBy: { sentAt: 'desc' },
    }),
    doc.participantId
      ? prisma.sessionParticipant.findFirst({
          where: { id: doc.participantId, session: { tenantId } },
          select: { conventionSigned: true, docStatus: true },
        })
      : Promise.resolve(null),
    doc.participantId
      ? prisma.opcoSubmission.findMany({
          where: { tenantId, participantId: doc.participantId, status: { not: 'DRAFT' } },
          select: { status: true, sentAt: true, attachments: true },
        })
      : Promise.resolve([]),
  ]);

  // Une pièce jointe de dossier est identifiée par sa CLÉ de stockage : c'est
  // le seul rattachement fiable (le dossier ne référence pas les ids Document).
  const submissionsWithDoc = submissions
    .filter((s) => attachmentKeys(s.attachments).includes(doc.pdfUrl))
    .map((s) => ({ status: s.status as string, sentAt: s.sentAt }));

  const docStatus = (participant?.docStatus ?? null) as Record<string, unknown> | null;
  const entry = docStatus?.[doc.type] as { state?: unknown } | undefined;

  return classifyDocumentEngagement({
    docType: doc.type,
    createdAt: doc.createdAt,
    emailSends: emailSends.map((e) => ({ sentAt: e.sentAt })),
    submissionsWithDoc,
    conventionSigned: participant?.conventionSigned === true,
    manuallyValidated: entry?.state === 'MANUAL_OK',
  });
}

/** Extrait défensivement les clés de stockage d'un `OpcoSubmission.attachments`. */
function attachmentKeys(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((a) =>
      a && typeof a === 'object' && 'key' in a ? (a as { key?: unknown }).key : null,
    )
    .filter((k): k is string => typeof k === 'string');
}

/**
 * Engagement du document qu'une action de la matrice s'apprête à remplacer ou
 * supprimer, pour un couple (inscription × type de document).
 *
 * Cherche d'abord le document nominatif ; à défaut, pour une CONVENTION, la
 * convention de GROUPE qui couvre ce participant (règle payeur personne morale
 * du 12/08 — c'est elle qui est partie chez le financeur, pas une nominative).
 *
 * `null` = aucun document à protéger.
 */
export async function getParticipantDocEngagement(
  tenantId: string,
  participantId: string,
  docType: string,
): Promise<{ documentId: string; engagement: DocumentEngagement } | null> {
  const nominatif = await prisma.document.findFirst({
    where: { tenantId, participantId, type: docType as never },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  let documentId = nominatif?.id ?? null;

  if (!documentId && docType === 'CONVENTION') {
    const participant = await prisma.sessionParticipant.findFirst({
      where: { id: participantId, session: { tenantId } },
      select: { sessionId: true, sponsorOrgId: true },
    });
    if (participant) {
      const groupe = await prisma.document.findFirst({
        where: groupConventionAnyShapeWhere(
          tenantId,
          participant.sessionId,
          participant.sponsorOrgId,
        ),
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      documentId = groupe?.id ?? null;
    }
  }

  if (!documentId) return null;
  const engagement = await getDocumentEngagement(tenantId, documentId);
  return engagement ? { documentId, engagement } : null;
}
