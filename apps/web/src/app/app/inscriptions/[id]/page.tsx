import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, FileText, CreditCard, Building2, Sparkles, Clock, Check, X,
  Inbox, AlertTriangle, AlertCircle, Loader2,
} from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { PreEnrollmentActions } from '@/components/preinscriptions/detail-actions';
import { RetryExtractionButton } from '@/components/preinscriptions/retry-extraction-button';
import { IdentityCheckPanel } from '@/components/preinscriptions/identity-check-panel';
import { SingleReminderButton } from '@/components/preinscriptions/single-reminder-button';

export const dynamic = 'force-dynamic';

const fmtDateTime = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const STATUS_LABEL: Record<string, { label: string; variant: 'muted' | 'info' | 'warning' | 'success' | 'danger' }> = {
  PENDING_FORM: { label: 'Lien envoyé', variant: 'muted' },
  SUBMITTED: { label: 'Reçu, à analyser', variant: 'info' },
  EXTRACTING: { label: 'IA en cours', variant: 'info' },
  EXTRACTED: { label: 'À valider', variant: 'warning' },
  VALIDATED: { label: 'Validé', variant: 'success' },
  CONVERTED: { label: 'Converti', variant: 'success' },
  EXPIRED: { label: 'Expiré', variant: 'danger' },
  REJECTED: { label: 'Rejeté', variant: 'danger' },
};

export default async function PreEnrollmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const pe = await prisma.preEnrollment.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!pe) notFound();

  const extracted = (pe.extractedData ?? null) as null | {
    cni?: any;
    rib?: any;
    cfp?: any;
    warnings?: string[];
    durationMs?: number;
  };

  const statusConfig = STATUS_LABEL[pe.status] ?? { label: pe.status, variant: 'muted' as const };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/inscriptions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Toutes les pré-inscriptions
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary-50 text-primary-700 inline-flex items-center justify-center">
              <Inbox className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {pe.firstName ?? '?'} {pe.lastName ?? ''}
                </h1>
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{pe.email ?? '— pas d\'email —'}</p>
            </div>
          </div>
          {(pe.status === 'EXTRACTED' || pe.status === 'EXTRACTING' || pe.status === 'SUBMITTED') && (
            <RetryExtractionButton preEnrollmentId={pe.id} />
          )}
        </div>
      </div>

      {/* Métadonnées */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Meta label="Émis le" value={fmtDateTime.format(pe.createdAt)} />
        <Meta label="Soumis le" value={pe.submittedAt ? fmtDateTime.format(pe.submittedAt) : '—'} />
        <Meta label="Expire le" value={fmtDateTime.format(pe.expiresAt)} />
        <Meta label="Pièces" value={[
          pe.cniKey && 'CNI',
          pe.ribKey && 'RIB',
          pe.cfpKey && 'CFP',
        ].filter(Boolean).join(' · ') || 'Aucune'} />
      </section>

      {/* Banner IA en cours */}
      {pe.status === 'SUBMITTED' && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <strong>IA en cours d'analyse…</strong> Recharge la page dans 30s pour voir le résultat.
        </div>
      )}
      {pe.status === 'EXTRACTING' && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Extraction IA en cours…
        </div>
      )}
      {pe.aiErrorMsg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 inline-flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">L'IA a rencontré un problème :</div>
            <div className="text-xs mt-1">{pe.aiErrorMsg}</div>
          </div>
        </div>
      )}

      {/* Données IA */}
      {extracted && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <IdentityCheckPanel
            cni={extracted.cni}
            saved={{
              firstName: pe.firstName,
              lastName: pe.lastName,
              birthDate: pe.birthDate,
              birthPlace: pe.birthPlace,
            }}
            hasDocument={!!pe.cniKey}
          />
          <ExtractCard title="RIB" icon={Building2} data={extracted.rib} />
          <ExtractCard title="Attestation CFP" icon={FileText} data={extracted.cfp} />
        </section>
      )}

      {extracted?.warnings && extracted.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-medium mb-1 inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Avertissements de l'extraction
          </div>
          <ul className="text-xs space-y-1 mt-2 list-disc pl-5">
            {extracted.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Données déclaratives */}
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">
          Données saisies par le contact
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Prénom" value={pe.firstName} />
          <Row label="Nom" value={pe.lastName} />
          <Row label="Email" value={pe.email} />
          <Row label="Téléphone" value={pe.phone} />
          <Row label="Date naissance" value={pe.birthDate?.toISOString().slice(0, 10) ?? null} />
          <Row label="Lieu naissance" value={pe.birthPlace} />
          <Row label="Statut pro" value={pe.professionalStatus} />
          <Row label="Niveau diplôme" value={pe.educationLevel} />
          <Row label="Diplôme" value={pe.diploma} />
          <Row label="Expérience" value={pe.professionalExperience} />
        </dl>
      </section>

      {/* Relance email — visible uniquement tant que la pré-inscription n'a pas été soumise */}
      {pe.status === 'PENDING_FORM' && pe.expiresAt > new Date() && (
        <SingleReminderButton
          preEnrollmentId={pe.id}
          reminderCount={pe.reminderCount}
          lastReminderSentAt={pe.lastReminderSentAt}
        />
      )}

      {/* Actions */}
      {(pe.status === 'EXTRACTED' || pe.status === 'SUBMITTED' || pe.status === 'VALIDATED') && (
        <PreEnrollmentActions
          preEnrollmentId={pe.id}
          status={pe.status}
          saved={{
            firstName: pe.firstName,
            lastName: pe.lastName,
            email: pe.email,
            phone: pe.phone,
            birthDate: pe.birthDate,
            birthPlace: pe.birthPlace,
            professionalStatus: pe.professionalStatus,
          }}
          extracted={extracted}
        />
      )}

      {pe.status === 'CONVERTED' && pe.convertedToPersonId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="inline-flex items-center gap-2 text-emerald-900 font-medium">
            <Check className="h-4 w-4" /> Cette pré-inscription a été convertie en apprenant.
          </div>
          <Link
            href={`/app/apprenants/${pe.convertedToPersonId}`}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Voir la fiche apprenant →
          </Link>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <dt className="text-xs text-muted-foreground w-32 shrink-0">{label}</dt>
      <dd className="text-sm font-medium flex-1 min-w-0 truncate">
        {value ?? <span className="text-muted-foreground italic">—</span>}
      </dd>
    </div>
  );
}

function ExtractCard({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  data: any;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h3 className="font-semibold text-sm inline-flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" /> {title}
        <Sparkles className="h-3 w-3 text-purple-500 ml-auto" />
      </h3>
      {!data ? (
        <p className="text-xs text-muted-foreground italic">Aucune donnée extraite (pièce manquante ou non lisible).</p>
      ) : (
        <dl className="space-y-1.5 text-xs">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <dt className="text-muted-foreground capitalize w-32 shrink-0">{key}</dt>
              <dd className="font-medium break-all">
                {value == null || value === '' ? <span className="italic text-muted-foreground">∅</span> : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
