import { notFound } from 'next/navigation';
import { Clock, Users } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EditProductButton } from '@/components/forms/edit-product-button';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';
import { DeleteProductButton } from '@/components/forms/delete-product-button';
import { ProductTabs } from '@/components/produits/tabs/product-tabs';
import type { ProductTabId } from '@/components/produits/tabs/product-tabs';
import { ProductStatsTab } from '@/components/produits/tabs/product-stats-tab';
import { ProductSessionsTab } from '@/components/produits/tabs/product-sessions-tab';
import { ProductLearnersTab } from '@/components/produits/tabs/product-learners-tab';
import { ProductProgrammeTab } from '@/components/produits/tabs/product-programme-tab';
// Phase 9.3 Plan 09.3-03 — NAV-02(b)(c) : onglet Documents (liste unifiée toutes sources).
import { ProductDocsTab } from '@/components/produits/tabs/product-docs-tab';
import { ProductSatisfactionPanel } from '@/components/produits/product-satisfaction-panel';
import { PriceMissingBanner } from '@/components/produits/price-missing-banner';
import {
  getProductStats,
  listProductSessions,
  listProductLearners,
  type ProductStats,
  type ProductSessionRow,
  type ProductLearnerRow,
} from '@/lib/product-stats';
import { getProductEvaluationStats, type EvaluationStats } from '@/lib/evaluation-stats';

/**
 * Phase 9.1 Plan 09.1-05 Task 3 — Fiche produit refondue en 4 onglets URL-state.
 *
 * CENTRAL-04 (4 onglets Stats / Sessions / Apprenants formés / Programme) +
 * CENTRAL-05 (cross-nav D-05 vers /app/sessions/{id} et /app/apprenants/{personId}).
 *
 * Pattern URL state (UI-SPEC §"Component Contracts > ProductTabs") :
 *  - Server Component lit `searchParams?.tab` (Next.js Page Props)
 *  - Coerce invalide → 'stats' (fallback safe, UI-SPEC §Edge Cases)
 *  - <ProductTabs> (Client) lit useSearchParams() pour active state +
 *    navigue via <Link href="?tab=X">
 *  - Lazy load : seulement les data du tab actif sont fetchées (pas d'over-fetch)
 *
 * Legacy header conservé (audit faux positif si supprimé) : BackToListLink +
 * DeleteProductButton + EditProductButton + RecordRecentVisit + PageHeader.
 * Les sections legacy "Documents Qualiopi du produit" / "Objectifs" /
 * "Programme détaillé" / "Modules" / "Public & prérequis" sont REMPLACÉES par
 * les 4 onglets (le Programme/Objectifs sont maintenant dans le tab Programme).
 */

const MOD_LABEL: Record<string, string> = {
  PRESENTIEL: 'Présentiel',
  DISTANCIEL: 'Distanciel',
  MIXTE: 'Mixte',
  ELEARNING: 'E-learning',
};

const VALID_TABS: readonly ProductTabId[] = [
  'stats',
  'sessions',
  'apprenants',
  'programme',
  'docs',
] as const;

function coerceTab(raw: string | undefined): ProductTabId {
  return (VALID_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as ProductTabId)
    : 'stats';
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const activeTab = coerceTab(sp.tab);

  // Charge le produit (toujours nécessaire pour Breadcrumb + PageHeader + EditButton).
  // Scope tenantId strict.
  const product = await prisma.trainingProduct.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { modules: { orderBy: { order: 'asc' } } },
  });
  if (!product) notFound();

  // Lazy load par tab — seulement les data nécessaires à l'onglet courant.
  // Le programmePdfId est chargé pour le tab "programme" (lien PDF si présent).
  let stats: ProductStats | null = null;
  let evalStats: EvaluationStats | null = null;
  let sessions: ProductSessionRow[] | null = null;
  let learners: ProductLearnerRow[] | null = null;
  let programmePdfId: string | null = null;

  if (activeTab === 'stats') {
    [stats, evalStats] = await Promise.all([
      getProductStats(id, user.tenantId),
      getProductEvaluationStats(id, user.tenantId),
    ]);
  } else if (activeTab === 'sessions') {
    sessions = await listProductSessions(id, user.tenantId);
  } else if (activeTab === 'apprenants') {
    learners = await listProductLearners(id, user.tenantId);
  } else if (activeTab === 'programme') {
    const programmeDoc = await prisma.document.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'PROGRAMME',
        entityType: 'product',
        entityId: id,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    programmePdfId = programmeDoc?.id ?? null;
  }

  const editCurrent = {
    title: product.title,
    theme: product.theme,
    durationHours: product.durationHours,
    priceHT: Number(product.priceHT),
    prerequisites: product.prerequisites,
    targetAudience: product.targetAudience,
    pedagogicalMethods: product.pedagogicalMethods,
    pedagogicalSupport: product.pedagogicalSupport,
    evaluationMethods: product.evaluationMethods,
    trainerProfile: product.trainerProfile,
    accessibility: product.accessibility,
    accessConditions: product.accessConditions,
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="product"
        id={product.id}
        title={product.title}
        subtitle={`${product.code} · ${product.durationHours}h`}
        href={`/app/produits/${product.id}`}
      />

      <Breadcrumb
        items={[
          { label: 'Catalogue', href: '/app/produits' },
          { label: product.title },
        ]}
      />

      {Number(product.priceHT) === 0 && (
        <PriceMissingBanner productId={product.id} current={editCurrent} />
      )}

      <div className="flex items-center justify-between gap-3">
        <BackToListLink fallbackHref="/app/produits" label="Retour au catalogue" />
        <DeleteProductButton productId={product.id} productCode={product.code} />
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={product.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="muted" className="font-mono">
                {product.code}
              </Badge>
              <Badge variant="info">{MOD_LABEL[product.modality] ?? product.modality}</Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {product.durationHours}h
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> {product.capacityMin}–{product.capacityMax} personnes
              </span>
              {Number(product.priceHT) > 0 && (
                <span className="text-xs font-medium text-foreground">
                  {Number(product.priceHT).toFixed(0)} € HT
                </span>
              )}
            </span>
          }
        />
        <EditProductButton productId={product.id} current={editCurrent} />
      </div>

      <ProductTabs activeTab={activeTab} />

      <div
        role="tabpanel"
        id={`tab-panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="transition-opacity duration-150"
      >
        {activeTab === 'stats' && stats && (
          <div className="space-y-5">
            <ProductStatsTab stats={stats} evalStats={evalStats} productId={product.id} />
            {/* Satisfaction agrégée toutes sessions confondues — Qualiopi 2026 :
                indicateur 30 ouvert au niveau produit en plus du niveau session */}
            <ProductSatisfactionPanel productId={product.id} tenantId={user.tenantId} />
          </div>
        )}
        {activeTab === 'sessions' && sessions && (
          <ProductSessionsTab sessions={sessions} productId={product.id} />
        )}
        {activeTab === 'apprenants' && learners && (
          <ProductLearnersTab learners={learners} />
        )}
        {activeTab === 'programme' && (
          <ProductProgrammeTab
            markdown={product.programMd}
            pdfId={programmePdfId}
            productId={product.id}
            aiDraftedAt={product.aiDraftedAt}
            canValidateAiDraft={['ADMIN', 'MANAGER'].includes(user.role)}
          />
        )}
        {/* Phase 9.3 NAV-02(b)(c) — onglet Documents (lazy : fetch côté ProductDocsTab). */}
        {activeTab === 'docs' && (
          <ProductDocsTab productId={product.id} tenantId={user.tenantId} />
        )}
      </div>
    </div>
  );
}
