import {
  PageHeaderSkeleton,
  KpiGridSkeleton,
  ListSkeleton,
} from '@/components/ui/skeleton';

/**
 * Squelette de chargement de `/app/preinscriptions` — auto-utilisé par
 * Next.js via Suspense pendant la résolution server du `page.tsx`.
 *
 * On reproduit la structure exacte de la page réelle :
 *  1. PageHeader (titre + sous-titre + bouton "Nouveau formulaire")
 *  2. Grille de 4 KPI (Liens envoyés / À valider / Convertis / Expirés)
 *  3. Liste cartes (6 rows par défaut, suffisant pour remplir le viewport)
 *
 * L'utilisateur perçoit immédiatement la structure de la page → moins de
 * cognitive load qu'un spinner abstrait. Le contenu skeleton s'efface
 * sans flash car la structure ring/shadow est identique.
 */
export default function PreinscriptionsLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiGridSkeleton count={4} />
      <ListSkeleton rows={6} />
    </div>
  );
}
