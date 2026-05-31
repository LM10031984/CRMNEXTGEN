import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * DataTableFolk — SaaS Premium (Stripe/Linear/Vercel).
 *
 *  - `ring-1 ring-slate-200/70 rounded-2xl shadow-card` pour profondeur visible.
 *  - Header `bg-gradient-to-b from-slate-50 to-white border-b border-slate-200`,
 *    libellés `text-xs font-bold uppercase tracking-wider text-slate-600`.
 *  - Rows séparées par `border-b border-slate-100/80`, `py-3.5 px-4` aérées,
 *    `hover:bg-slate-50/80 transition-colors cursor-pointer`.
 *  - Texte data `text-sm text-slate-700` ou `text-slate-900` selon importance.
 *
 * API identique au DataTable original — migration = renommage de l'import.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  width?: string;
  /** Si true, la cellule de cette colonne n'est PAS wrappée dans le `<a>`
   * de rowHref. Utile pour les colonnes "actions" qui contiennent des
   * boutons cliquables qu'on ne veut pas faire naviguer. */
  noLink?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
}

export function DataTableFolk<T>({ rows, columns, rowKey, rowHref, empty }: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card py-20 text-center text-sm text-slate-500">
        {empty ?? 'Aucun résultat.'}
      </div>
    );
  }

  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden transition-shadow hover:shadow-card-hover">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'py-3 px-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600',
                    col.className,
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    'border-b border-slate-100/80 last:border-0 transition-colors',
                    href && 'hover:bg-slate-50/80 cursor-pointer',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('py-3.5 px-4 align-top text-sm text-slate-700', col.className)}
                    >
                      {href && !col.noLink ? (
                        <a href={href} className="block">
                          {col.cell(row)}
                        </a>
                      ) : (
                        col.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
