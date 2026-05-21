'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, ChevronDown } from 'lucide-react';

/**
 * Phase 11 Plan 11-08 Task 2 — Bouton "Exporter" haut droite (D-15).
 *
 * DropdownMenu Radix avec 3 raccourcis prédéfinis (Ce mois / Mois dernier /
 * Année courante). Chaque item est un `<a href>` natif vers la route
 * `/api/factures/export?from=YYYY-MM-DD&to=YYYY-MM-DD` (Plan 11-07).
 *
 * RBAC (D-17) : ADMIN + COMPTABLE only. Si autre rôle → composant retourne
 * `null` (côté Server Component parent on passe `currentRole = user.role`).
 *
 * Why client : Radix DropdownMenu requiert un Portal + état d'ouverture côté
 * client. Mais l'action métier (download xlsx) reste un GET HTTP standard
 * (anchor tag) — pas besoin de fetch JS.
 */

interface Props {
  currentRole: string;
}

function isoDate(d: Date): string {
  // YYYY-MM-DD local (pas UTC) — sinon décalage 1 jour en France
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeHref(from: Date, to: Date): string {
  return `/api/factures/export?from=${isoDate(from)}&to=${isoDate(to)}`;
}

export function InvoicesExportButton({ currentRole }: Props) {
  // D-17 RBAC — masquer si pas ADMIN ni COMPTABLE
  if (!['ADMIN', 'COMPTABLE'].includes(currentRole)) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const quarterIdx = Math.floor(now.getMonth() / 3);
  const quarterStart = new Date(now.getFullYear(), quarterIdx * 3, 1);
  const quarterEnd = new Date(now.getFullYear(), quarterIdx * 3 + 3, 0);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          <DropdownMenu.Item asChild>
            <a
              href={makeHref(monthStart, monthEnd)}
              className="block cursor-pointer px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100"
            >
              Ce mois
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a
              href={makeHref(lastMonthStart, lastMonthEnd)}
              className="block cursor-pointer px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100"
            >
              Mois dernier
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a
              href={makeHref(quarterStart, quarterEnd)}
              className="block cursor-pointer px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100"
            >
              Trimestre courant
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a
              href={makeHref(yearStart, now)}
              className="block cursor-pointer px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100"
            >
              Année courante
            </a>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
