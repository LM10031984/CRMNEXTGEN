import {
  PageHeaderSkeleton,
  FilterChipsSkeleton,
  DataTableSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/dossiers-opco` — Header + filtres + table. */
export default function DossiersOpcoLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterChipsSkeleton pills={4} />
      <DataTableSkeleton rows={8} columns={5} />
    </div>
  );
}
