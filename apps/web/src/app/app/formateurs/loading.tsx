import { PageHeaderSkeleton, ListSkeleton } from '@/components/ui/skeleton';

/** Squelette `/app/formateurs` — Header + liste. */
export default function FormateursLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <ListSkeleton rows={6} />
    </div>
  );
}
