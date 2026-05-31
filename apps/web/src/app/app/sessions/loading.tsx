import {
  PageHeaderSkeleton,
  FilterChipsSkeleton,
  ListSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/sessions` — PageHeader + search/chips + 10 rows liste. */
export default function SessionsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterChipsSkeleton pills={8} />
      <ListSkeleton rows={10} />
    </div>
  );
}
