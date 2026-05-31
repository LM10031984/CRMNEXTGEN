import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  FilterChipsSkeleton,
  DataTableSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/factures` — Header + 4 PrioCards + filtres + table 7 colonnes. */
export default function FacturesLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiGridSkeleton count={4} />
      <FilterChipsSkeleton pills={4} />
      <DataTableSkeleton rows={8} columns={7} />
    </div>
  );
}
