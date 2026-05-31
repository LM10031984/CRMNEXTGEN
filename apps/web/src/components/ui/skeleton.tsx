import { cn } from '@/lib/utils';

/**
 * Skeleton — bloc placeholder gris avec animation pulse (style SaaS Premium).
 *
 * Usage primitif :
 *   <Skeleton className="h-4 w-32 rounded-md" />
 *
 * Helpers composés ci-dessous pour reproduire les structures récurrentes
 * du CRM (PageHeader, KpiPill, row de liste, DataTable, Card). Permet de
 * créer un `loading.tsx` qui imite la page réelle au pixel près, plutôt
 * qu'un spinner abstrait → l'utilisateur perçoit déjà la mise en page.
 *
 * Couleur :
 *  - `bg-slate-100` au repos, plus subtil que `bg-slate-200` pour ne pas
 *    saturer l'écran quand on a 20+ skeletons en même temps.
 *  - `animate-pulse` (Tailwind built-in) → opacity oscille entre 1 et 0.5.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-slate-100 rounded-md', className)} />;
}

// ─────────────────────────────────────────────────────────────
// Helpers composés — imitent des sections récurrentes du CRM.
// ─────────────────────────────────────────────────────────────

/** En-tête de page (titre h1 + sous-titre + bouton action à droite). */
export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-40 rounded-xl" />
    </div>
  );
}

/** Pastille KPI : icône cercle + chiffre + label (cohérent avec KpiPill réel). */
export function KpiPillSkeleton() {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5 flex items-center gap-4">
      <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  );
}

/** Grille de KpiPill — par défaut 4 colonnes responsive comme dans nos pages. */
export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <KpiPillSkeleton key={i} />
      ))}
    </section>
  );
}

/** Ligne de liste (avatar + 2 lignes de texte + badge à droite + chevron). */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-0">
      <Skeleton className="h-11 w-11 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-24 rounded-md hidden md:block shrink-0" />
      <Skeleton className="h-3 w-24 rounded-md hidden lg:block shrink-0" />
      <Skeleton className="h-6 w-28 rounded-full shrink-0" />
      <Skeleton className="h-4 w-4 rounded-md shrink-0" />
    </div>
  );
}

/** Liste cartes encapsulée dans son conteneur — N rows. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Carte générique avec titre + corps (utile pour panneaux). */
export function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6 space-y-3', className)}>
      <Skeleton className="h-5 w-1/3" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

/** SearchInput + barre de FilterChips (5 pills + bouton outline). */
export function FilterChipsSkeleton({ pills = 5 }: { pills?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 justify-between">
      <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
      <div className="flex items-center gap-1.5 flex-wrap">
        {Array.from({ length: pills }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Tableau (DataTable) — header + N rows. Utilise la même structure ring/shadow. */
export function DataTableSkeleton({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50/60 border-b border-slate-100 px-4 py-3.5 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i === columns - 1 ? 'w-16 ml-auto' : 'flex-1 max-w-[180px]')} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-slate-100 last:border-0 px-4 py-3.5 flex items-center gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className={cn(c === columns - 1 ? 'ml-auto' : 'flex-1 max-w-[180px]', 'space-y-1.5')}>
              <Skeleton className={cn('h-3.5', c === 0 ? 'w-3/4' : c === columns - 1 ? 'w-16' : 'w-2/3')} />
              {c === 0 && <Skeleton className="h-2.5 w-1/2" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Header de fiche détail — back link discret + avatar/icon + titre +
 * sous-titre meta + badge + bouton action à droite. Cohérent avec les
 * vrais headers de /sessions/[id], /apprenants/[id], /factures/[id].
 */
export function DetailHeaderSkeleton({
  withAction = true,
  avatarShape = 'rounded',
}: {
  withAction?: boolean;
  /** `rounded` = carré arrondi (factures/sessions), `circle` = avatar (apprenants). */
  avatarShape?: 'rounded' | 'circle';
}) {
  return (
    <div>
      <Skeleton className="h-3 w-40 mb-3" />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Skeleton className={cn('h-14 w-14 shrink-0', avatarShape === 'circle' ? 'rounded-full' : 'rounded-2xl')} />
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        {withAction && <Skeleton className="h-10 w-36 rounded-xl" />}
      </div>
    </div>
  );
}

/** Section avec titre + grille de lignes label/value (pour fiches). */
export function DetailSectionSkeleton({ rows = 4, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6 space-y-4">
      {title && <Skeleton className="h-4 w-1/3" />}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-24 shrink-0" />
            <Skeleton className="h-3.5 flex-1 max-w-[200px]" />
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Squelette dashboard — replique la structure /app : hero + onglets + KPI + 2 panneaux + chart + table. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </div>

      {/* Onglets segmented */}
      <Skeleton className="h-12 w-72 rounded-xl" />

      {/* Filtre année (chips) */}
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-lg" />
        ))}
      </div>

      {/* À l'essentiel — 4 PrioCards */}
      <div>
        <Skeleton className="h-3 w-32 mb-3" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5 space-y-4">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertes + Pipeline */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </section>

      {/* Top sessions/produits/sponsors */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </section>

      {/* Chart mois */}
      <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6 space-y-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    </div>
  );
}
