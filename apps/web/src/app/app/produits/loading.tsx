import {
  PageHeaderSkeleton,
  FilterChipsSkeleton,
  ListSkeleton,
} from '@/components/ui/skeleton';

/** Squelette `/app/produits` — Header + filtres + liste. */
export default function ProduitsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterChipsSkeleton pills={3} />
      <ListSkeleton rows={8} />
    </div>
  );
}
