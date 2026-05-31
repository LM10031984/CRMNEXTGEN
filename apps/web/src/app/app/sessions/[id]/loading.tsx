import {
  DetailHeaderSkeleton,
  KpiGridSkeleton,
  DetailSectionSkeleton,
  ListSkeleton,
  CardSkeleton,
} from '@/components/ui/skeleton';

/**
 * Squelette `/app/sessions/[id]` — réplique la structure de la fiche :
 *  1. Header (back link + code + nom + badge statut + actions)
 *  2. KPI row (CA / inscrits / heures / taux remplissage)
 *  3. Section produit/dates/logistique (détails 4 rows)
 *  4. Liste participants (table de 6 lignes)
 *  5. Bloc Qualiopi matrix + factures (2 cartes)
 */
export default function SessionDetailLoading() {
  return (
    <div className="space-y-6">
      <DetailHeaderSkeleton withAction avatarShape="rounded" />
      <KpiGridSkeleton count={4} />
      <DetailSectionSkeleton rows={4} />
      <ListSkeleton rows={6} />
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </section>
    </div>
  );
}
