import { Plus, Clock, Users, GraduationCap, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
// 28/08 — « je voudrais pouvoir générer un programme sans générer de session » :
// la page Produits ouvre désormais le MÊME formulaire complet que le wizard de
// session (champs Qualiopi, programme éditable, transcription d'une proposition
// client), au lieu d'un formulaire minimal sans relecture possible.
import { QuickCreateProductButton } from '@/components/wizards/quick-create-product';

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

  const [total, rows, catalogStats] = await Promise.all([
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
        aiDraftedAt: true,
      },
    }),
    // Stats agrégées du catalogue : total apprenants uniques, CA cumulé,
    // produits en draft IA. Bug 2026-06-04 : l'ancien $queryRaw plantait
    // avec `operator does not exist: text = jsonb` (cause Postgres opaque).
    // Remplacé par 3 queries Prisma typées robustes.
    (async () => {
      const productScope = {
        session: { product: { tenantId: user.tenantId, isActive: true } },
      };
      const [learnersAgg, revenueAgg, aiDrafts] = await Promise.all([
        prisma.sessionParticipant.findMany({
          where: productScope,
          select: { personId: true },
          distinct: ['personId'],
        }),
        prisma.sessionParticipant.aggregate({
          where: productScope,
          _sum: { priceHT: true },
        }),
        prisma.trainingProduct.count({
          where: { tenantId: user.tenantId, isActive: true, aiDraftedAt: { not: null } },
        }),
      ]);
      return {
        totalLearners: learnersAgg.length,
        totalRevenue: Number(revenueAgg._sum.priceHT ?? 0),
        aiDrafts,
      };
    })(),
  ]);

  // Map productId → { learners, sessions } — remplacé le $queryRaw par
  // 1 query Prisma typée (Laurent 2026-06-04 : "operator does not exist:
  // text = jsonb" — bug Postgres opaque que l'API Prisma évite).
  const productIds = rows.map((p) => p.id);
  const learnerByProduct = new Map<string, { learners: number; sessions: number }>();
  if (productIds.length > 0) {
    const sessions = await prisma.trainingSession.findMany({
      where: { productId: { in: productIds }, tenantId: user.tenantId },
      select: {
        id: true,
        productId: true,
        participants: { select: { personId: true } },
      },
    });
    // Aggrège côté JS : distinct personId par productId + count sessions par productId
    const acc = new Map<string, { sessions: Set<string>; personIds: Set<string> }>();
    for (const s of sessions) {
      let entry = acc.get(s.productId);
      if (!entry) {
        entry = { sessions: new Set(), personIds: new Set() };
        acc.set(s.productId, entry);
      }
      entry.sessions.add(s.id);
      for (const p of s.participants) entry.personIds.add(p.personId);
    }
    for (const [pid, e] of acc) {
      learnerByProduct.set(pid, { learners: e.personIds.size, sessions: e.sessions.size });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits de formation"
        subtitle={`${total} formation${total > 1 ? 's' : ''} active${total > 1 ? 's' : ''}`}
        actions={<QuickCreateProductButton label="Nouveau programme" />}
      />

      {/* BUG-P0-01 follow-up — bandeau stats catalogue : apprenants uniques formés,
          CA cumulé, brouillons IA en attente de validation. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
            <GraduationCap className="h-3.5 w-3.5" />
            Apprenants formés
          </div>
          <div className="text-2xl font-semibold">{catalogStats.totalLearners}</div>
          <div className="text-xs text-muted-foreground">tous produits, uniques</div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
            CA cumulé
          </div>
          <div className="text-2xl font-semibold">
            {catalogStats.totalRevenue.toLocaleString('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="text-xs text-muted-foreground">HT inscriptions</div>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            catalogStats.aiDrafts > 0
              ? 'border-amber-300 bg-amber-50'
              : 'border-border bg-white'
          }`}
        >
          <div
            className={`flex items-center gap-2 text-xs uppercase tracking-wide mb-1 ${
              catalogStats.aiDrafts > 0 ? 'text-amber-800' : 'text-muted-foreground'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Brouillons IA
          </div>
          <div
            className={`text-2xl font-semibold ${
              catalogStats.aiDrafts > 0 ? 'text-amber-900' : ''
            }`}
          >
            {catalogStats.aiDrafts}
          </div>
          <div
            className={`text-xs ${
              catalogStats.aiDrafts > 0 ? 'text-amber-800' : 'text-muted-foreground'
            }`}
          >
            {catalogStats.aiDrafts > 0
              ? 'à valider avant pack fin de formation'
              : 'tous validés'}
          </div>
        </div>
      </div>

      <SearchInput placeholder="Titre, code, thème, public visé…" />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-sm text-muted-foreground">
          {q ? `Aucune formation ne correspond à « ${q} ».` : 'Aucune formation.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((p) => {
            const stats = learnerByProduct.get(p.id) ?? { learners: 0, sessions: 0 };
            return (
              <Link
                key={p.id}
                href={`/app/produits/${p.id}`}
                className="rounded-2xl border border-border bg-white p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Badge variant="muted" className="font-mono">{p.code}</Badge>
                  <div className="flex items-center gap-1.5">
                    {p.aiDraftedAt && (
                      <span
                        title="Brouillon IA en attente de validation — bloque le pack fin de formation"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200"
                      >
                        <Sparkles className="h-3 w-3" />
                        Draft IA
                      </span>
                    )}
                    <Badge variant="info">{MOD_LABEL[p.modality] ?? p.modality}</Badge>
                  </div>
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
                  {Number(p.priceHT) > 0 ? (
                    <span className="ml-auto font-medium text-foreground">
                      {Number(p.priceHT).toFixed(0)} € HT
                    </span>
                  ) : (
                    <Badge variant="danger" className="ml-auto">
                      Prix manquant
                    </Badge>
                  )}
                </div>
                {/* Compteur apprenants formés (sessions tenues × inscrits uniques).
                    Affiché en permanence — 0 si le produit n'a jamais été utilisé. */}
                <div className="flex items-center gap-3 text-xs border-t border-border pt-3 mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 font-medium ${
                      stats.learners > 0 ? 'text-foreground' : 'text-muted-foreground/60'
                    }`}
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    {stats.learners} apprenant{stats.learners > 1 ? 's' : ''} formé
                    {stats.learners > 1 ? 's' : ''}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {stats.sessions} session{stats.sessions > 1 ? 's' : ''}
                  </span>
                </div>
                {p.targetAudience && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {p.targetAudience}
                  </p>
                )}
              </Link>
            );
          })}
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
