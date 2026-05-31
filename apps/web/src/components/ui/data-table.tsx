import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  width?: string;
  // Si true, la cellule de cette colonne n'est PAS wrappée dans le <a>
  // de rowHref. Utile pour les colonnes "actions" qui contiennent des
  // boutons cliquables qu'on ne veut pas faire naviguer.
  noLink?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
}

export function DataTable<T>({ rows, columns, rowKey, rowHref, empty }: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-16 text-center text-sm text-slate-500">
        {empty ?? 'Aucun résultat.'}
      </div>
    );
  }

  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden transition-shadow hover:shadow-card-hover">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600',
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
                    'border-b border-slate-100/80 last:border-0 hover:bg-slate-50/80 transition-colors duration-150',
                    href && 'cursor-pointer',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3.5 text-slate-700', col.className)}>
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
