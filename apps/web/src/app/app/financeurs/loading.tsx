import { PageHeaderSkeleton, KpiPillSkeleton } from '@/components/ui/skeleton';

/** Squelette `/app/financeurs` — Header + grille de 6 financeurs en cards KPI. */
export default function FinanceursLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiPillSkeleton key={i} />
        ))}
      </section>
    </div>
  );
}
