import { notFound } from 'next/navigation';
import { prisma } from '@qualiof/db';
import { DIAGNOSTIC_CHAPTERS, type DiagnosticChapter } from '@qualiof/shared/diagnostic';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { ChapterWorkspace } from '@/components/diagnostic-r1/chapter-workspace';

/**
 * L'écran de saisie d'un chapitre.
 *
 * Le serveur ne fait que charger : questions, réponses, fiches équipe et règles
 * de financement. Les synthèses sont calculées côté client par les moteurs purs
 * — c'est ce qui les rend instantanées en rendez-vous.
 */
export const dynamic = 'force-dynamic';

export default async function ChapitrePage({
  params,
}: {
  params: Promise<{ id: string; chapitre: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id, chapitre } = await params;

  const chapterNumber = Number(chapitre);
  const known = DIAGNOSTIC_CHAPTERS.some((c) => c.chapter === chapterNumber);
  if (!known) notFound();
  const chapter = chapterNumber as DiagnosticChapter;

  const diagnostic = await prisma.diagnostic.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      reference: true,
      variant: true,
      status: true,
      answers: { select: { questionId: true, value: true, isSkipped: true } },
      participants: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          statut: true,
          fonction: true,
          caN1: true,
          opcoEligible: true,
          trainings24mFunded: true,
          wantsTraining: true,
          includedInProposal: true,
        },
      },
    },
  });
  if (!diagnostic) notFound();

  const { values: rules } = await loadFundingRules(user.tenantId);

  // Lecture seule pour les rôles qui consultent sans saisir, et pour un
  // diagnostic archivé.
  const readOnly =
    diagnostic.status === 'ARCHIVE' || !hasRole(user, ['ADMIN', 'MANAGER', 'COMMERCIAL']);

  return (
    <ChapterWorkspace
      diagnosticId={diagnostic.id}
      reference={diagnostic.reference}
      variant={diagnostic.variant}
      chapter={chapter}
      readOnly={readOnly}
      initialAnswers={diagnostic.answers.map((a) => ({
        questionId: a.questionId,
        value: a.value,
        isSkipped: a.isSkipped,
      }))}
      initialParticipants={diagnostic.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        statut: p.statut,
        fonction: p.fonction,
        // Decimal → number : sans Number(), toute comparaison serait fausse.
        caN1: p.caN1 === null ? null : Number(p.caN1),
        opcoEligible: p.opcoEligible,
        trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded),
        wantsTraining: p.wantsTraining,
        includedInProposal: p.includedInProposal,
      }))}
      rules={rules}
    />
  );
}
