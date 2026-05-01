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
      <div className="rounded-2xl border border-border bg-white p-12 text-center text-sm text-muted-foreground">
        {empty ?? 'Aucun résultat.'}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
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
            {rows.map((row, idx) => {
              const href = rowHref?.(row);
              const tr = (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                    href && 'cursor-pointer',
                    idx % 2 === 1 && 'bg-muted/10',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3', col.className)}>
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
              return tr;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
