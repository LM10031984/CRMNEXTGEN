import {
  DetailHeaderSkeleton,
  KpiGridSkeleton,
  DetailSectionSkeleton,
  ListSkeleton,
  Skeleton,
} from '@/components/ui/skeleton';

/**
 * Squelette `/app/factures/[id]` — réplique la fiche facture :
 *  1. Header (back link + icône cercle violet + numéro mono + badge + bouton PDF)
 *  2. KPI×4 (HT / TVA / TTC / Reste)
 *  3. Barre actions (RecordPaymentForm + boutons avoir/relance)
 *  4. 4 Blocks (Apprenant / Payeur / Session / Notes)
 *  5. Historique paiements (table 4 colonnes)
 */
export default function FactureDetailLoading() {
  return (
    <div className="space-y-6">
      <DetailHeaderSkeleton withAction avatarShape="rounded" />
      <KpiGridSkeleton count={4} />

      {/* Barre actions */}
      <div className="flex flex-wrap items-start gap-3">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>

      {/* 4 Blocks (Apprenant / Payeur / Session / Notes) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSectionSkeleton rows={2} />
        <DetailSectionSkeleton rows={2} />
        <DetailSectionSkeleton rows={3} />
        <DetailSectionSkeleton rows={2} />
      </section>

      {/* Historique paiements */}
      <ListSkeleton rows={4} />
    </div>
  );
}
