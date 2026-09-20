import Link from 'next/link';
import { CheckCircle2, CircleDashed, TriangleAlert } from 'lucide-react';
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

function StatusBadge({ tone }: { tone: FundingTone }) {
  const view = toneView[tone];
  const Icon = view.icon;
  return (
    <Badge className={view.className}>
      <Icon className="mr-1 h-3 w-3" />
      {view.label}
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
        </div>
        <StatusBadge tone={tone} />
      </div>
      <div className="mt-4 divide-y rounded-lg border">
        {companies.map((company) => (
          <div key={company.sponsorOrgId} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{company.sponsorName}</p>
                <p className="text-xs text-muted-foreground">{company.detail}</p>
              </div>
              <StatusBadge tone={company.tone} />
            </div>
            <CompanyDepositTracker
              sessionId={sessionId}
              sponsorOrgId={company.sponsorOrgId}
              members={company.members}
              depositedAt={company.depositedAt}
              depositedBy={company.depositedBy}
              userEmail={userEmail}
              canWrite={canWrite}
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
              <StatusBadge tone={learner.tone} />
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
