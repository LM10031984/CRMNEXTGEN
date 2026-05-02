import { Plus, Clock, Users } from 'lucide-react';
import Link from 'next/link';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { CreateProductButton } from '@/components/forms/create-product-button';

const PAGE_SIZE = 24;

const MOD_LABEL: Record<string, string> = {
  PRESENTIEL: 'Présentiel',
  DISTANCIEL: 'Distanciel',
  MIXTE: 'Mixte',
  ELEARNING: 'E-learning',
};

interface SP {
  q?: string;
  page?: string;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { q, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);

  const where: Prisma.TrainingProductWhereInput = {
    tenantId: user.tenantId,
    isActive: true,
  };
  if (q && q.trim()) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
      { theme: { contains: q, mode: 'insensitive' } },
      { targetAudience: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.trainingProduct.count({ where }),
    prisma.trainingProduct.findMany({
      where,
      orderBy: { title: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        title: true,
        durationHours: true,
        modality: true,
        priceHT: true,
        targetAudience: true,
        capacityMin: true,
        capacityMax: true,
        bpfSpecialty: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits de formation"
        subtitle={`${total} formation${total > 1 ? 's' : ''} active${total > 1 ? 's' : ''}`}
        actions={<CreateProductButton />}
      />

      <SearchInput placeholder="Titre, code, thème, public visé…" />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-sm text-muted-foreground">
          {q ? `Aucune formation ne correspond à « ${q} ».` : 'Aucune formation.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((p) => (
            <Link
              key={p.id}
              href={`/app/produits/${p.id}`}
              className="rounded-2xl border border-border bg-white p-5 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <Badge variant="muted" className="font-mono">{p.code}</Badge>
                <Badge variant="info">{MOD_LABEL[p.modality] ?? p.modality}</Badge>
              </div>
              <h3 className="font-semibold leading-snug line-clamp-2 mb-3 min-h-[2.5em]">
                {p.title}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {p.durationHours}h
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {p.capacityMin}–{p.capacityMax} pers.
                </span>
                {Number(p.priceHT) > 0 && (
                  <span className="ml-auto font-medium text-foreground">
                    {Number(p.priceHT).toFixed(0)} € HT
                  </span>
                )}
              </div>
              {p.targetAudience && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-2 border-t border-border pt-3">
                  {p.targetAudience}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        basePath="/app/produits"
        searchParams={{ q }}
      />
    </div>
  );
}
