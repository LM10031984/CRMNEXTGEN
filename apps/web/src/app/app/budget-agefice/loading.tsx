import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  FilterChipsSkeleton,
  DataTableSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/budget-agefice` — Header + KPI + filtres + table. */
export default function BudgetAgeficeLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiGridSkeleton count={3} />
      <FilterChipsSkeleton pills={3} />
      <DataTableSkeleton rows={8} columns={5} />
    </div>
  );
}
