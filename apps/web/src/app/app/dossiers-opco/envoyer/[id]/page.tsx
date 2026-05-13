/**
 * Prévisu d'un dossier OPCO avant envoi (US-4 étape C).
 *
 * Affiche le draft composé par composeOpcoSubmission, permet à Laurent
 * d'éditer subject/body/PJ puis d'envoyer (SMTP) ou de marquer envoyé manuel.
 */

import { redirect } from 'next/navigation';
import { Mail } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { getOpcoSubmission, type SubmissionAttachment } from '@/server/actions/opco-submission';
import { SubmissionEditor } from '@/components/dossiers-opco/submission-editor';
import { formatFunderCode } from '@/lib/funder-codes';

export const dynamic = 'force-dynamic';

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export default async function ComposeOpcoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;

  const { id } = await params;
  const sub = await getOpcoSubmission(id);
  if (!sub) {
    redirect('/app/dossiers-opco' as never);
  }

  // Si déjà envoyé, on affiche un récap simple sans éditeur
  if (sub.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-muted/30 p-6">
          <h1 className="text-xl font-semibold inline-flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Dossier OPCO — {STATUS_LABELS[sub.status]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sub.participant.person.firstName} {sub.participant.person.lastName.toUpperCase()} ·{' '}
            {sub.participant.session.product.title}
          </p>
          {sub.sentAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Envoyé le {fmtDate.format(sub.sentAt)} à {sub.recipientEmail ?? '—'}
            </p>
          )}
          {sub.internalNotes && (
            <p className="text-xs text-muted-foreground mt-1 italic">{sub.internalNotes}</p>
          )}
        </div>
        <a
          href="/app/dossiers-opco"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Retour à la liste
        </a>
      </div>
    );
  }

  const apprenantName = `${sub.participant.person.firstName} ${sub.participant.person.lastName.toUpperCase()}`;
  const sessionLabel = `${sub.participant.session.product.title} · ${fmtDate.format(sub.participant.session.startDate)}`;
  const sponsorName = `${sub.sponsorOrg.legalName}${sub.sponsorOrg.opcoCode ? ` (${formatFunderCode(sub.sponsorOrg.opcoCode)})` : ''}`;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
        <Mail className="h-6 w-6 text-primary" /> Composer le dossier OPCO
      </h1>

      <SubmissionEditor
        id={sub.id}
        initial={{
          recipientEmail: sub.recipientEmail,
          subject: sub.subject,
          bodyHtml: sub.bodyHtml,
          attachments: (sub.attachments as unknown as SubmissionAttachment[]) ?? [],
          apprenantName,
          sessionLabel,
          sponsorName,
        }}
      />
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  ACK_RECEIVED: 'Accusé reçu',
  APPROVED: 'Accord OPCO reçu',
  REJECTED: 'Refusé',
  REIMBURSED: 'Remboursé',
  CANCELED: 'Annulé',
};
