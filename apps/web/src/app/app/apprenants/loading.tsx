import {
  PageHeaderSkeleton,
  FilterChipsSkeleton,
  DataTableSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/apprenants` — PageHeader + search/chips + DataTable 8 lignes × 4 colonnes. */
export default function ApprenantsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterChipsSkeleton pills={3} />
      <DataTableSkeleton rows={8} columns={4} />
    </div>
  );
}
