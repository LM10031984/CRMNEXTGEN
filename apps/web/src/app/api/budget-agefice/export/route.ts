/**
 * Export CSV (UTF-8 BOM Excel-friendly) de la vue Budget AGEFICE filtrée.
 *
 * Reprend les mêmes searchParams que la page :
 *   ?year=2026&filter=has_budget_left&q=...
 *
 * Format de sortie : `budget-agefice_<filter>_<year>_<YYYYMMDD>.csv`
 */

import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { listLearnersWithAgeficeBudget } from '@/server/actions/budget-agefice';
import { PLAFOND_AGEFICE } from '@/lib/budget-agefice-constants';

export const dynamic = 'force-dynamic';

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function todayCompact(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

type Filter = 'all' | 'has_budget_left' | 'no_consumption' | 'near_limit' | 'over';

export async function GET(req: Request) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const filterParam = url.searchParams.get('filter');
  const allowed: readonly Filter[] = ['all', 'has_budget_left', 'no_consumption', 'near_limit', 'over'];
  const filter: Filter = allowed.includes((filterParam ?? '') as Filter)
    ? (filterParam as Filter)
    : 'has_budget_left';
  const q = url.searchParams.get('q')?.trim() ?? undefined;

  const rows = await listLearnersWithAgeficeBudget({ year, filter, search: q });

  const headers = [
    'Nom',
    'Prénom',
    'Email',
    `Consommé ${year} (€)`,
    `Plafond AGEFICE (€)`,
    'Restant (€)',
    'Pourcentage consommé',
    'Sessions',
    'Statut',
  ];

  const statusLabel: Record<string, string> = {
    free: 'Aucune consommation',
    low: 'Budget largement disponible',
    mid: 'Mi-budget',
    near_limit: 'Proche du plafond',
    over: 'Plafond dépassé',
  };

  const lines = [headers.map(csvEscape).join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.lastName.toUpperCase(),
        r.firstName,
        r.email ?? '',
        r.consomme.toFixed(2),
        PLAFOND_AGEFICE.toFixed(2),
        r.restant.toFixed(2),
        `${r.pct}%`,
        String(r.nbSessions),
        statusLabel[r.status] ?? r.status,
      ]
        .map(csvEscape)
        .join(';'),
    );
  }

  const BOM = '﻿';
  const body = BOM + lines.join('\r\n');

  const filename = `budget-agefice_${filter}_${year}_${todayCompact()}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
