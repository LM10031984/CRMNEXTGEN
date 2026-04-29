import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { searchProducts, listTrainers } from '@/server/actions/sessions-create';
import { SessionWizard } from '@/components/wizards/session-wizard';

export const dynamic = 'force-dynamic';

export default async function NouvelleSessionPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const [products, trainers] = await Promise.all([searchProducts(''), listTrainers()]);

  // Convertit les Decimals en numbers pour passer côté client
  const productsForClient = products.map((p) => ({
    ...p,
    priceHT: Number(p.priceHT),
    groupFlatPrice: p.groupFlatPrice ? Number(p.groupFlatPrice) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/sessions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Toutes les sessions
        </Link>
        <PageHeader
          title="Nouvelle session"
          subtitle="Wizard 4 étapes : produit → dates & lieu → participants → confirmation"
        />
      </div>

      <SessionWizard initialProducts={productsForClient} initialTrainers={trainers} />
    </div>
  );
}
