import Link from 'next/link';
import { CheckCircle2, CircleDashed, Download, ExternalLink, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FundingTone } from '@/lib/opco/session-funding-status';
import {
  CompanyDepositTracker,
  type CompanyDepositMemberSnapshot,
} from './company-deposit-tracker';

export interface FundingLearnerRow {
  participantId: string;
  name: string;
  sponsorName: string;
  kind: 'AGEFICE';
  tone: FundingTone;
  submissionId: string | null;
  detail: string;
}

export interface FundingCompanyRow {
  sponsorOrgId: string;
  sponsorName: string;
  tone: FundingTone;
  detail: string;
  members: CompanyDepositMemberSnapshot[];
  depositedAt: string | null;
  depositedBy: string | null;
  pieces: Array<{
    participantId: string;
    kind: 'CONVENTION' | 'PROGRAMME';
    label: string;
  }>;
  missingLearners: string[];
  programmeMissing: boolean;
}

const toneView = {
  neutral: {
    label: 'À déposer',
    className: 'border-slate-300 bg-slate-50 text-slate-700',
    icon: CircleDashed,
  },
  warning: {
    label: 'À vérifier',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
    icon: TriangleAlert,
  },
  success: {
    label: 'Déposé',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
} satisfies Record<FundingTone, { label: string; className: string; icon: typeof CheckCircle2 }>;

function StatusBadge({ tone, label }: { tone: FundingTone; label?: string }) {
  const view = toneView[tone];
  const Icon = view.icon;
  return (
    <Badge className={view.className}>
      <Icon className="mr-1 h-3 w-3" />
      {label ?? view.label}
    </Badge>
  );
}

export function SessionFundingSummary({
  sessionId,
  tone,
  learners,
  companies,
  userEmail,
  canWrite,
}: {
  sessionId: string;
  tone: FundingTone;
  learners: FundingLearnerRow[];
  companies: FundingCompanyRow[];
  userEmail: string;
  canWrite: boolean;
}) {
  if (learners.length === 0 && companies.length === 0) return null;
  return (
    <section
      id="depots-financement"
      className="rounded-xl border bg-card p-4 shadow-sm"
      aria-labelledby="session-funding-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="session-funding-title" className="text-sm font-semibold">
            Dépôts de financement
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Suivi des dépôts réellement effectués. Un dépôt ne signifie pas que le financement est
            accordé.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Vert : dépôt confirmé · Ambre : dossier partiel ou à vérifier · Gris : à déposer.
          </p>
        </div>
        <StatusBadge tone={tone} />
      </div>
      <div className="mt-4 divide-y rounded-lg border">
        {companies.map((company) => (
          <div
            key={company.sponsorOrgId}
            id={`depot-${company.sponsorOrgId}`}
            className="space-y-3 p-3 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{company.sponsorName}</p>
                <p className="text-xs text-muted-foreground">{company.detail}</p>
              </div>
              <StatusBadge tone={company.tone} />
            </div>
            <div className="space-y-1.5">
              {company.pieces.map((piece) => {
                const href = `/api/sessions/${sessionId}/opco-portail/${company.sponsorOrgId}/${piece.participantId}/${piece.kind}`;
                return (
                  <div
                    key={`${piece.kind}-${piece.participantId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs"
                  >
                    <span>{piece.label}</span>
                    <span className="flex items-center gap-3">
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Ouvrir
                      </a>
                      <a
                        href={`${href}?dl=1`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Download className="h-3 w-3" /> Télécharger
                      </a>
                    </span>
                  </div>
                );
              })}
              {(company.missingLearners.length > 0 || company.programmeMissing) && (
                <p className="text-xs text-amber-800">
                  Pièces à compléter :
                  {company.missingLearners.length > 0
                    ? ` convention signée (${company.missingLearners.join(', ')})`
                    : ''}
                  {company.programmeMissing
                    ? `${company.missingLearners.length > 0 ? ' ;' : ''} programme de formation`
                    : ''}
                  .
                </p>
              )}
            </div>
            <CompanyDepositTracker
              sessionId={sessionId}
              sponsorOrgId={company.sponsorOrgId}
              members={company.members}
              depositedAt={company.depositedAt}
              depositedBy={company.depositedBy}
              userEmail={userEmail}
              canWrite={canWrite}
              readyToDeposit={company.missingLearners.length === 0 && !company.programmeMissing}
            />
          </div>
        ))}
        {learners.map((learner) => (
          <div
            key={learner.participantId}
            className="flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <div>
              <p className="text-sm font-medium">{learner.name}</p>
              <p className="text-xs text-muted-foreground">
                AGEFICE · {learner.sponsorName} · {learner.detail}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge
                tone={learner.tone}
                label={learner.tone === 'success' ? 'Conforme et déposé' : undefined}
              />
              {learner.submissionId && (
                <Link
                  className="text-xs font-medium text-primary underline underline-offset-2"
                  href={`/app/dossiers-opco/envoyer/${learner.submissionId}`}
                >
                  Voir le dossier
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
