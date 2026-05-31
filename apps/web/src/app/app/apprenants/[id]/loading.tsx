import {
  DetailHeaderSkeleton,
  KpiGridSkeleton,
  DetailSectionSkeleton,
  ListSkeleton,
  CardSkeleton,
} from '@/components/ui/skeleton';

/**
 * Squelette `/app/apprenants/[id]` — réplique la fiche apprenant :
 *  1. Header avec avatar rond (initiales)
 *  2. 3 PrioCards (timeline last activity, sessions, budget AGEFICE)
 *  3. Section identité (10 rows split en 2 colonnes)
 *  4. Liste inscriptions / timeline (6 rows)
 *  5. Bloc factures + organisations liées
 */
export default function ApprenantDetailLoading() {
  return (
    <div className="space-y-6">
      <DetailHeaderSkeleton withAction avatarShape="circle" />
      <KpiGridSkeleton count={3} />
      <DetailSectionSkeleton rows={6} />
      <ListSkeleton rows={5} />
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </section>
    </div>
  );
}
