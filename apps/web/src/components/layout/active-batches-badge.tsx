'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Loader2 } from 'lucide-react';
import { getActiveClosureBatches } from '@/server/actions/closure-pack';
import { cn } from '@/lib/utils';

interface ActiveBatch {
  count: number;
  latest?: { id: string; sessionId: string; totalDocs: number; doneDocs: number };
}

/**
 * Badge sidebar : "X pack(s) en cours" — rassure l'utilisateur qui a quitté
 * la page batch que la génération continue côté worker BullMQ. Click → page
 * de progression du dernier batch lancé.
 *
 * Polling 5s tant qu'un batch est actif, 20s sinon (idle).
 */
export function ActiveBatchesBadge({ collapsed }: { collapsed: boolean }) {
  const [data, setData] = useState<ActiveBatch>({ count: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await getActiveClosureBatches();
        if (!cancelled) setData(r);
      } catch {
        // silencieux : si l'API est down, on remontre simplement plus tard
      }
      if (cancelled) return;
      // Polling adaptatif : 5s si du travail en cours, 20s sinon.
      const delay = data.count > 0 ? 5000 : 20000;
      timer = setTimeout(tick, delay);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // data.count est lu dans tick mais on ne veut PAS relancer l'effet à
    // chaque update (sinon le clearTimeout/relance crée du jitter). L'effet
    // se monte une fois et boucle indéfiniment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (data.count === 0 || !data.latest) return null;

  const { count, latest } = data;
  const pct = latest.totalDocs > 0 ? Math.round((latest.doneDocs / latest.totalDocs) * 100) : 0;
  const href = `/app/sessions/${latest.sessionId}/closure/${latest.id}` as Route;
  const label = `${count} pack${count > 1 ? 's' : ''} en cours`;

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'mx-3 mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 transition-colors hover:bg-amber-100',
        collapsed ? 'justify-center p-2' : 'px-3 py-2',
      )}
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-700" />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-amber-700/80 tabular-nums">
            {latest.doneDocs}/{latest.totalDocs} docs · {pct}%
          </div>
        </div>
      )}
    </Link>
  );
}
