import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { DIAGNOSTIC_QUESTIONS } from '@qualiof/shared/diagnostic';

import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { renderAnswerValue } from '@/lib/diagnostic-r1/audit-builder';
import {
  SEUIL_CONFIANCE_DEFAUT,
  trierParException,
  type AnswerRevue,
} from '@/lib/diagnostic-r1/transcript/triage';
import { jourLongAvecAnnee } from '@/lib/dates-fr';
import {
  TranscriptWorkspace,
  type LigneRevueVue,
} from '@/components/diagnostic-r1/transcript-workspace';

/**
 * L'onglet « Compte rendu » d'un diagnostic (lot C, §6.4).
 *
 * Tout ce qui se calcule est calculé ICI, côté serveur, par les moteurs purs :
 * le tri des trois files et le rendu lisible des valeurs. Le composant client
 * ne reçoit que des chaînes déjà prêtes — il gère les gestes, pas la vérité.
 */
export const dynamic = 'force-dynamic';

const QUESTIONS_BY_ID = new Map(DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]));

export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const diagnostic = await prisma.diagnostic.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      reference: true,
      variant: true,
      status: true,
      mode: true,
      transcriptText: true,
      transcriptSource: true,
      prefillAt: true,
      prefillModel: true,
      organization: { select: { legalName: true } },
      lead: { select: { firstName: true, lastName: true, notes: true } },
      answers: {
        select: {
          questionId: true,
          value: true,
          isSkipped: true,
          origin: true,
          confirmedAt: true,
          aiConfidence: true,
          aiQuote: true,
        },
      },
    },
  });
  if (!diagnostic) notFound();

  // Le TEXTE du compte rendu ne descend JAMAIS dans les props du composant
  // client : il porte des propos nominatifs sur des salariés qui n'ont pas
  // demandé à y figurer (§L-10), et tout ce qui est passé à un composant
  // client part dans le HTML de la page. On n'en garde que la taille — assez
  // pour savoir qu'il est là et le dire à l'écran.
  const longueur = diagnostic.transcriptText?.length ?? 0;

  const readOnly =
    diagnostic.status === 'ARCHIVE' || !hasRole(user, ['ADMIN', 'MANAGER', 'COMMERCIAL']);

  const answers: AnswerRevue[] = diagnostic.answers.map((a) => ({
    questionId: a.questionId,
    value: a.value,
    isSkipped: a.isSkipped,
    origin: a.origin,
    confirmed: a.confirmedAt !== null,
    // Decimal → number : sans Number(), toute comparaison au seuil serait fausse.
    confidence: a.aiConfidence === null ? null : Number(a.aiConfidence),
    quote: a.aiQuote,
  }));

  const revue = trierParException(diagnostic.variant, answers, SEUIL_CONFIANCE_DEFAUT);

  const enVue = (l: (typeof revue.aVerifier)[number]): LigneRevueVue => {
    const question = QUESTIONS_BY_ID.get(l.questionId);
    return {
      questionId: l.questionId,
      chapter: l.chapter,
      chapterTitle: l.chapterTitle,
      question: l.question,
      valeur: question
        ? renderAnswerValue(question, {
            questionId: l.questionId,
            value: l.value,
            isSkipped: false,
          })
        : String(l.value ?? ''),
      confidence: l.confidence,
      quote: l.quote,
    };
  };

  const agence =
    diagnostic.organization?.legalName ??
    diagnostic.lead.notes?.replace(/^Agence\s*:\s*/, '') ??
    [diagnostic.lead.firstName, diagnostic.lead.lastName].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compte rendu du rendez-vous"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{diagnostic.reference}</span>
            {agence ? <span>· {agence}</span> : null}
            <Badge variant={diagnostic.mode === 'GUIDE' ? 'info' : 'success'}>
              {diagnostic.mode === 'GUIDE'
                ? 'Saisie guidée'
                : diagnostic.mode === 'TRANSCRIPT'
                  ? 'Transcript'
                  : 'Hybride'}
            </Badge>
          </span>
        }
        actions={
          <Link
            href={`/app/diagnostics/${id}?vue=recap` as Route}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au diagnostic
          </Link>
        }
      />

      <TranscriptWorkspace
        diagnosticId={diagnostic.id}
        readOnly={readOnly}
        transcript={{
          present: longueur > 0,
          longueur,
          source: diagnostic.transcriptSource,
          prefillAt: diagnostic.prefillAt ? jourLongAvecAnnee(diagnostic.prefillAt) : null,
          prefillModel: diagnostic.prefillModel,
        }}
        revue={{
          aVerifier: revue.aVerifier.map(enVue),
          confirmables: revue.confirmables.map(enVue),
          manquantes: revue.manquantes,
          tauxPreRemplissage: revue.tauxPreRemplissage,
          tauxCouverture: revue.tauxCouverture,
          visiblesCount: revue.visiblesCount,
          aRelireCount: revue.aRelireCount,
        }}
        seuil={SEUIL_CONFIANCE_DEFAUT}
      />
    </div>
  );
}
