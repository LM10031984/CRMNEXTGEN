import {
  PageHeaderSkeleton,
  FilterChipsSkeleton,
  DataTableSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/organisations` — PageHeader + search/chips + DataTable 8 lignes × 5 colonnes. */
export default function OrganisationsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterChipsSkeleton pills={4} />
      <DataTableSkeleton rows={8} columns={5} />
    </div>
  );
}
