import Link from 'next/link';
import { BookOpen, Users, Clock, Euro, GraduationCap, ThumbsUp } from 'lucide-react';
import type { ProductStats } from '@/lib/product-stats';
import type { EvaluationStats } from '@/lib/evaluation-stats';

/**
 * Phase 9.1 Plan 09.1-05 Task 2 — Tab "Stats" de la fiche produit (Server Component).
 *
 * Rend 4 PrioCard EN GRILLE responsive (UI-SPEC §Surface 3 + §Responsive) :
 *  - Sessions réalisées       (depuis {firstYear})
 *  - Apprenants formés total  (tous temps)
 *  - Heures totales           (délivrées)
 *  - CA cumulé HT             (HT facturé)
 *
 * Edge case (UI-SPEC §Empty states) : si `sessionsRealisees === 0`, tous les
 * cards affichent leurs valeurs (0) avec sub `aucune session terminée`.
 *
 * Clone-local PrioCard (D-Phase9-K Phase 9) — pas d'export vers components/ui/
 * tant que le pattern n'est pas factorisé (cohérence Phase 6 / Phase 9).
 */

interface Props {
  stats: ProductStats;
  evalStats?: EvaluationStats | null;
  productId: string;
}

/** « X sessions, Y stagiaires » — base de calcul des taux (transparence). */
function evalBase(nbSessions: number, nbStagiaires: number): string {
  const s = `${nbSessions} session${nbSessions > 1 ? 's' : ''}`;
  const p = `${nbStagiaires} stagiaire${nbStagiaires > 1 ? 's' : ''}`;
  return `${s}, ${p}`;
}

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function ProductStatsTab({ stats, evalStats, productId }: Props) {
  const noSessions = stats.sessionsRealisees === 0;
  const qcm = evalStats?.qcm ?? null;
  const reco = evalStats?.reco ?? null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <PrioCardLocal
        icon={BookOpen}
        label="SESSIONS RÉALISÉES"
        value={String(stats.sessionsRealisees)}
        subtitle={noSessions ? 'aucune session terminée' : `depuis ${stats.firstYear}`}
        href={`/app/produits/${productId}?tab=sessions`}
        hint="Voir la liste des sessions"
      />
      <PrioCardLocal
        icon={Users}
        label="APPRENANTS FORMÉS"
        value={String(stats.apprenantsFormesTotal)}
        subtitle={noSessions ? 'aucune session terminée' : 'tous temps'}
        href={`/app/produits/${productId}?tab=apprenants`}
        hint="Voir la liste des apprenants formés"
      />
      <PrioCardLocal
        icon={Clock}
        label="HEURES TOTALES"
        value={`${stats.heuresTotales} h`}
        subtitle={noSessions ? 'aucune session terminée' : 'délivrées'}
      />
      <PrioCardLocal
        icon={Euro}
        label="CA CUMULÉ"
        value={fmtEUR.format(stats.caCumule)}
        subtitle={noSessions ? 'aucune session terminée' : 'HT facturé'}
      />
      <PrioCardLocal
        icon={GraduationCap}
        label="RÉUSSITE QCM"
        value={qcm ? `${qcm.tauxReussite} %` : '—'}
        subtitle={
          qcm
            ? `moyenne ${qcm.scoreMoyen} % · ${evalBase(evalStats?.nbSessions ?? 0, qcm.nbStagiaires)}`
            : 'aucune évaluation'
        }
      />
      <PrioCardLocal
        icon={ThumbsUp}
        label="RECOMMANDATION"
        value={reco ? `${reco.tauxRecommandation} %` : '—'}
        subtitle={
          reco
            ? `${evalBase(evalStats?.nbSessions ?? 0, reco.nbReponses)}`
            : 'aucune évaluation'
        }
      />
    </div>
  );
}

function PrioCardLocal({
  icon: Icon,
  label,
  value,
  subtitle,
  href,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium leading-tight">
          {label}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href as any}
        title={hint}
        className="rounded-lg border border-border bg-white p-5 block hover:border-primary hover:bg-primary-50/30 transition-colors cursor-pointer"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-lg border border-border bg-white p-5">{inner}</div>;
}
