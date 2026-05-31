import {
  PageHeaderSkeleton,
  FilterChipsSkeleton,
  ListSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/leads` — PageHeader + filtres + 8 rows liste. */
export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterChipsSkeleton pills={5} />
      <ListSkeleton rows={8} />
    </div>
  );
}
