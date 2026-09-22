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

import { DocType, prisma } from '@qualiof/db';
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
  /**
   * Le document PORTE un exemplaire signé : `signedPdfUrl` rempli — scan
   * déposé (`persistSignedScan`) ou retour d'e-signature DocuSeal.
   *
   * TROU FERMÉ LE 21/09/2026. Ce fait n'était pas lu : une pièce signée
   * ÉLECTRONIQUEMENT ne touche pas `docStatus`, donc elle ressortait « libre »
   * et se laissait écraser sans un mot. Une assiduité signée par l'apprenant
   * pouvait disparaître d'un clic sur « Régénérer ».
   *
   * `null` = aucun exemplaire signé. Sinon l'objet, dont la date PEUT être
   * nulle : c'est la PRÉSENCE de l'exemplaire qui engage, pas sa date. Déduire
   * le fait d'une date aurait laissé passer un scan déposé sans `signedAt`.
   */
  signedCopy: { at: Date | null } | null;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function dateOuPas(d: Date | null): string {
  return d ? ` le ${fmtDate.format(d)}` : '';
}

/**
 * Les clés de stockage sous lesquelles ce document a PU être joint à un dossier.
 *
 * DEUX, pas une : `versionAJoindre` joint `signedPdfUrl ?? pdfUrl`, donc un
 * dossier de solde porte la clé SIGNÉE dès qu'elle existe. Une seule clé
 * cherchée, et la pièce signée déjà partie passait pour libre (21/09/2026).
 */
function clesDuDocument(doc: { pdfUrl: string; signedPdfUrl: string | null }): string[] {
  return [doc.pdfUrl, doc.signedPdfUrl].filter(
    (k): k is string => typeof k === 'string' && k.trim() !== '',
  );
}

/** L'exemplaire signé attaché au document, s'il y en a un. Voir `EngagementFacts.signedCopy`. */
function exemplaireSigne(doc: {
  signedPdfUrl: string | null;
  signedAt: Date | null;
}): { at: Date | null } | null {
  return typeof doc.signedPdfUrl === 'string' && doc.signedPdfUrl.trim() !== ''
    ? { at: doc.signedAt }
    : null;
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
  if (facts.signedCopy !== null) {
    reasons.push(`un exemplaire signé est attaché${dateOuPas(facts.signedCopy.at)}`);
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
    select: {
      id: true,
      type: true,
      createdAt: true,
      pdfUrl: true,
      signedPdfUrl: true,
      signedAt: true,
      participantId: true,
    },
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
  //
  // ⚠ DEUX clés à chercher, pas une (trou fermé le 21/09/2026). Un dossier
  // joint la version SIGNÉE quand elle existe (`versionAJoindre` :
  // `signedPdfUrl ?? pdfUrl`). Ne chercher que `pdfUrl` faisait passer pour
  // « libre » une pièce signée partie dans un dossier de solde — exactement le
  // cas qu'il fallait protéger.
  const submissionsWithDoc = submissions
    .filter((s) => {
      const cles = attachmentKeys(s.attachments);
      return clesDuDocument(doc).some((k) => cles.includes(k));
    })
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
    signedCopy: exemplaireSigne(doc),
  });
}

/** Forme minimale d'un document pour l'engagement (chargée par l'appelant). */
export interface DocumentForEngagement {
  id: string;
  type: string;
  createdAt: Date;
  pdfUrl: string;
  /**
   * REQUIS, et volontairement : le rendre optionnel aurait laissé les
   * appelants l'oublier en silence, ce qui était exactement le défaut du
   * 21/09/2026. `tsc` sert ici de filet d'exhaustivité.
   */
  signedPdfUrl: string | null;
  signedAt: Date | null;
  participantId: string | null;
}

/**
 * Engagement PROUVÉ, pour tous les documents d'une session, en 3 requêtes.
 *
 * Ne retient que le niveau `ENGAGED` — la sortie est établie, pas supposée.
 * `MAYBE_SENT` est volontairement EXCLU : tout document sans empreinte est
 * antérieur au suivi des envois, donc « peut-être envoyé » ; s'en servir pour
 * masquer une action reviendrait à ne jamais rien proposer sur le parc ancien.
 * Le doute reste traité là où il a un sens — la confirmation au clic.
 */
export async function findEngagedDocumentIds(
  tenantId: string,
  documents: DocumentForEngagement[],
): Promise<Set<string>> {
  const engaged = new Set<string>();
  if (documents.length === 0) return engaged;

  try {
    const participantIds = Array.from(
      new Set(documents.map((d) => d.participantId).filter((p): p is string => Boolean(p))),
    );

    const [emails, participants, submissions] = await Promise.all([
      prisma.emailMessage.findMany({
        where: {
          tenantId,
          OR: documents.map((d) => ({ documentIds: { array_contains: [d.id] } })),
        },
        select: { sentAt: true, documentIds: true },
      }),
      participantIds.length > 0
        ? prisma.sessionParticipant.findMany({
            where: { id: { in: participantIds }, session: { tenantId } },
            select: { id: true, conventionSigned: true, docStatus: true },
          })
        : Promise.resolve([]),
      participantIds.length > 0
        ? prisma.opcoSubmission.findMany({
            where: { tenantId, participantId: { in: participantIds }, status: { not: 'DRAFT' } },
            select: { participantId: true, status: true, sentAt: true, attachments: true },
          })
        : Promise.resolve([]),
    ]);

    const participantById = new Map(participants.map((p) => [p.id, p]));

    for (const doc of documents) {
      const participant = doc.participantId ? participantById.get(doc.participantId) : undefined;
      const docStatus = (participant?.docStatus ?? null) as Record<string, unknown> | null;
      const entry = docStatus?.[doc.type] as { state?: unknown } | undefined;

      const verdict = classifyDocumentEngagement({
        docType: doc.type,
        createdAt: doc.createdAt,
        emailSends: emails
          .filter((e) => Array.isArray(e.documentIds) && (e.documentIds as unknown[]).includes(doc.id))
          .map((e) => ({ sentAt: e.sentAt })),
        submissionsWithDoc: submissions
          .filter((sub) => {
            if (sub.participantId !== doc.participantId) return false;
            const cles = attachmentKeys(sub.attachments);
            return clesDuDocument(doc).some((k) => cles.includes(k));
          })
          .map((sub) => ({ status: sub.status as string, sentAt: sub.sentAt })),
        conventionSigned: participant?.conventionSigned === true,
        manuallyValidated: entry?.state === 'MANUAL_OK',
        signedCopy: exemplaireSigne(doc),
      });

      if (verdict.level === 'ENGAGED') engaged.add(doc.id);
    }
  } catch (e) {
    // Comme pour la péremption : pas d'information vaut mieux qu'une page qui
    // tombe. On perd la mise en garde, pas la garde serveur au moment d'agir.
    console.warn(
      '[document-engagement] détection d’engagement indisponible :',
      e instanceof Error ? e.message : e,
    );
  }
  return engaged;
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
  // La matrice envoie le nom de la COLONNE cliquée. Pour les documents de
  // clôture, ce nom vient de `ClosureDocKind` / `PedagogicalAssetKind` —
  // `SATISFACTION_CHAUD`, `QCM`, `DEROULE_PEDA`, `GRILLE_OBS`… — et n'existe
  // pas dans `DocType`. Le `type: docType as never` d'avant laissait la chaîne
  // filer jusqu'à Prisma, qui la refuse À L'EXÉCUTION : toute la page tombait
  // en 500 (production, 21/09 — « Invalid value for argument `type` »). Un
  // `as never` avait transformé une erreur de compilation en panne de prod.
  //
  // Un kind absent de `DocType` n'a, par construction, aucune ligne `Document`
  // à protéger : on ne pose pas la question à la base.
  const estDocType = Object.prototype.hasOwnProperty.call(DocType, docType);

  const nominatif = estDocType
    ? await prisma.document.findFirst({
        where: { tenantId, participantId, type: docType as DocType },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;

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
