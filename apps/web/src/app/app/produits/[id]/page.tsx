import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Users, Target, ListChecks } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EditProductButton } from '@/components/forms/edit-product-button';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';
import { DeleteProductButton } from '@/components/forms/delete-product-button';

const MOD_LABEL: Record<string, string> = {
  PRESENTIEL: 'Présentiel',
  DISTANCIEL: 'Distanciel',
  MIXTE: 'Mixte',
  ELEARNING: 'E-learning',
};

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const product = await prisma.trainingProduct.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { modules: { orderBy: { order: 'asc' } } },
  });
  if (!product) notFound();

  const objectives = (product.objectives ?? []) as string[];

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="product"
        id={product.id}
        title={product.title}
        subtitle={`${product.code} · ${product.durationHours}h`}
        href={`/app/produits/${product.id}`}
      />
      <div className="flex items-center justify-between gap-3">
        <BackToListLink fallbackHref="/app/produits" label="Retour au catalogue" />
        <DeleteProductButton productId={product.id} productCode={product.code} />
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={product.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="muted" className="font-mono">{product.code}</Badge>
              <Badge variant="info">{MOD_LABEL[product.modality] ?? product.modality}</Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {product.durationHours}h
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> {product.capacityMin}–{product.capacityMax} personnes
              </span>
              {Number(product.priceHT) > 0 && (
                <span className="text-xs font-medium text-foreground">
                  {Number(product.priceHT).toFixed(0)} € HT
                </span>
              )}
            </span>
          }
        />
        <EditProductButton
          productId={product.id}
          current={{
            title: product.title,
            theme: product.theme,
            durationHours: product.durationHours,
            priceHT: Number(product.priceHT),
            prerequisites: product.prerequisites,
            targetAudience: product.targetAudience,
            pedagogicalMethods: product.pedagogicalMethods,
            pedagogicalSupport: product.pedagogicalSupport,
            evaluationMethods: product.evaluationMethods,
            trainerProfile: product.trainerProfile,
            accessibility: product.accessibility,
            accessConditions: product.accessConditions,
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {objectives.length > 0 && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                <Target className="h-4 w-4" /> Objectifs pédagogiques
              </h2>
              <ul className="space-y-2 text-sm">
                {objectives.filter(Boolean).map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {product.programMd && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Programme détaillé
              </h2>
              <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed max-h-[600px] overflow-auto">
                {product.programMd}
              </pre>
            </section>
          )}

          {product.modules.length > 0 && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
                Modules ({product.modules.length})
              </h2>
              <ol className="space-y-3">
                {product.modules.map((m, i) => (
                  <li key={m.id} className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary-50 text-primary-700 inline-flex items-center justify-center font-semibold text-xs shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.floor(m.durationMin / 60)}h{(m.durationMin % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-white p-6 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Public & prérequis
            </h2>
            <Field label="Public visé" value={product.targetAudience ?? '—'} multiline />
            <Field label="Prérequis" value={product.prerequisites ?? '—'} multiline />
            <Field label="Modalités d'accès" value={product.accessConditions ?? '—'} multiline />
            <Field label="Profil formateurs" value={product.trainerProfile ?? '—'} multiline />
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Pédagogie & évaluation
            </h2>
            <Field
              label="Modalités pédagogiques"
              value={product.pedagogicalMethods ?? '—'}
              multiline
            />
            <Field
              label="Supports pédagogiques"
              value={product.pedagogicalSupport ?? '—'}
              multiline
            />
            <Field
              label="Modalités d'évaluation"
              value={product.evaluationMethods ?? '—'}
              multiline
            />
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              BPF
            </h2>
            <Field label="Spécialité" value={product.bpfSpecialty ?? '—'} multiline />
            <Field label="Catégorie" value={product.bpfCategory ?? '—'} multiline />
            <Field label="Niveau" value={product.bpfLevel ?? '—'} multiline />
            {product.excludedFromBpf && <Badge variant="warning">Hors BPF</Badge>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">
        {label}
      </dt>
      <dd className={`text-sm ${multiline ? 'whitespace-pre-line' : ''}`}>{value}</dd>
    </div>
  );
}
