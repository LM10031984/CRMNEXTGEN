'use server';

/**
 * État agrégé des documents de FIN de formation pour une session.
 *
 * Symétrique à `getSessionPreparationStatus` (docs pré-formation).
 * Consommé par le composant <ClosureFormationBlock> sur la fiche session.
 *
 * 2 colonnes UX (alignées sur process Qualiopi Start Academy) :
 *   - Partagés (session-level) : Grille observation · Bilan satisfaction
 *   - Par stagiaire           : Émargement · Assiduité AGEFICE (TNS) ·
 *                                Attestation · Certificat · QCM ·
 *                                Positionnement · Satisfaction chaud / froid
 *
 * Bulk-query : 3 requêtes Postgres (Document, PedagogicalAsset, ClosureBatch).
 */

import { prisma, type DocType, type PedagogicalKind } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export interface SessionClosureStatus {
  ok: boolean;
  error?: string;
  participantsCount: number;
  // Partagés (session-level) — boolean
  grilleObsSession: boolean;
  bilanSatisfaction: boolean;
  // Par stagiaire — compteurs X/N
  emargements: number;
  assiduites: number;
  ageficeEligibleCount: number; // pour piloter affichage assiduité AGEFICE
  attestations: number;
  certificats: number;
  qcm: number;
  positionnements: number;
  satisfactionChaud: number;
  satisfactionFroid: number;
  // Batch en cours / dernier batch
  latestBatchId?: string;
  latestBatchStatus?: 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR' | string;
}

export async function getSessionClosureStatus(
  sessionId: string,
): Promise<SessionClosureStatus> {
  const empty: SessionClosureStatus = {
    ok: false,
    participantsCount: 0,
    grilleObsSession: false,
    bilanSatisfaction: false,
    emargements: 0,
    assiduites: 0,
    ageficeEligibleCount: 0,
    attestations: 0,
    certificats: 0,
    qcm: 0,
    positionnements: 0,
    satisfactionChaud: 0,
    satisfactionFroid: 0,
  };

  const { user } = await validateRequest();
  if (!user) return { ...empty, error: 'Non authentifié' };

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true, participants: { select: { id: true } } },
  });
  if (!session) return { ...empty, error: 'Session introuvable' };

  const participantIds = session.participants.map((p) => p.id);

  const sessionDocTypes: DocType[] = [
    'GRILLE_OBS_SESSION',
    'SATISFACTION_SESSION',
  ];
  const participantDocTypes: DocType[] = [
    'ATTESTATION_FIN',
    'CERTIFICAT_REALISATION',
    'ASSIDUITE',
  ];
  const participantAssetKinds: PedagogicalKind[] = [
    'QCM',
    'POSITIONNEMENT',
    'SATISFACTION_CHAUD',
    'SATISFACTION_FROID',
    'EMARGEMENT',
  ];

  const [sessionDocs, participantDocs, participantAssets, latestBatch, ageficeEligibleCount] =
    await Promise.all([
      // Docs session-level
      prisma.document.findMany({
        where: {
          tenantId: user.tenantId,
          sessionId: session.id,
          type: { in: sessionDocTypes },
        },
        select: { type: true },
      }),
      // Docs par stagiaire (ATTESTATION_FIN / CERTIFICAT_REALISATION / ASSIDUITE)
      participantIds.length > 0
        ? prisma.document.findMany({
            where: {
              tenantId: user.tenantId,
              sessionId: session.id,
              participantId: { in: participantIds },
              type: { in: participantDocTypes },
            },
            select: { type: true, participantId: true },
          })
        : Promise.resolve(
            [] as Array<{ type: DocType; participantId: string | null }>,
          ),
      // Assets pédagogiques (QCM / POSITIONNEMENT / SATISFACTION / EMARGEMENT)
      participantIds.length > 0
        ? prisma.pedagogicalAsset.findMany({
            where: {
              tenantId: user.tenantId,
              sessionId: session.id,
              participantId: { in: participantIds },
              kind: { in: participantAssetKinds },
              pdfUrl: { not: null },
            },
            select: { kind: true, participantId: true },
          })
        : Promise.resolve(
            [] as Array<{ kind: PedagogicalKind; participantId: string | null }>,
          ),
      // Dernier batch closure de la session (pour exposer batchId + statut)
      prisma.closureBatch.findFirst({
        where: { tenantId: user.tenantId, sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      }),
      // Éligibles AGEFICE — même requête que prepare-training.
      participantIds.length > 0
        ? prisma.sessionParticipant.count({
            where: {
              sessionId: session.id,
              OR: [
                { sponsorOrg: { opcoCode: 'AGEFICE' } },
                {
                  person: {
                    legalLinks: {
                      some: {
                        role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] },
                        organization: { ageficeProfile: { isNot: null } },
                      },
                    },
                  },
                },
              ],
            },
          })
        : Promise.resolve(0),
    ]);

  // Session-level booléens
  const grilleObsSession = sessionDocs.some((d) => d.type === 'GRILLE_OBS_SESSION');
  const bilanSatisfaction = sessionDocs.some((d) => d.type === 'SATISFACTION_SESSION');

  // Par stagiaire — count distinct participants par type
  const countByDocType = (t: DocType): number =>
    new Set(
      participantDocs
        .filter((d) => d.type === t && d.participantId != null)
        .map((d) => d.participantId as string),
    ).size;
  const countByAssetKind = (k: PedagogicalKind): number =>
    new Set(
      participantAssets
        .filter((a) => a.kind === k && a.participantId != null)
        .map((a) => a.participantId as string),
    ).size;

  return {
    ok: true,
    participantsCount: participantIds.length,
    grilleObsSession,
    bilanSatisfaction,
    emargements: countByAssetKind('EMARGEMENT'),
    assiduites: countByDocType('ASSIDUITE'),
    ageficeEligibleCount,
    attestations: countByDocType('ATTESTATION_FIN'),
    certificats: countByDocType('CERTIFICAT_REALISATION'),
    qcm: countByAssetKind('QCM'),
    positionnements: countByAssetKind('POSITIONNEMENT'),
    satisfactionChaud: countByAssetKind('SATISFACTION_CHAUD'),
    satisfactionFroid: countByAssetKind('SATISFACTION_FROID'),
    latestBatchId: latestBatch?.id,
    latestBatchStatus: latestBatch?.status,
  };
}
