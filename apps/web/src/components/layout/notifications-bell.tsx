'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, Inbox, AlertTriangle, AlertCircle, Users, ChevronRight, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNotifications, type NotificationItem, type NotificationKind } from '@/server/actions/notifications';
import { markNotificationRead } from '@/server/actions/notification-mark-read';

const ICONS: Record<NotificationKind, React.ComponentType<{ className?: string; strokeWidth?: number | string }>> = {
  preinscription: Inbox,
  session_no_attendee: AlertTriangle,
  session_to_close: AlertCircle,
  cleanup: Users,
  'lead.assigned': UserPlus,
};

const SEVERITY_CLASSES: Record<NotificationItem['severity'], string> = {
  // Pastel doux, sans bordure — l'icône cercle se pose sur fond blanc.
  info: 'text-blue-700 bg-blue-50',
  warning: 'text-amber-700 bg-amber-50',
  danger: 'text-red-700 bg-red-50',
};

export function NotificationsBell() {
  const [data, setData] = useState<{ total: number; items: NotificationItem[] } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchNow() {
      try {
        const r = await getNotifications();
        if (!cancelled) setData(r);
      } catch {
        // ignore
      }
    }
    fetchNow();
    const interval = setInterval(fetchNow, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="
            relative inline-flex items-center justify-center h-10 w-10 rounded-xl
            text-slate-500 hover:text-slate-900 hover:bg-slate-100/80
            transition-all duration-200 ease-in-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200
          "
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {total > 0 && (
            <span
              className="
                absolute top-1 right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold tabular-nums
                ring-2 ring-white shadow-soft
              "
            >
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="
            z-50 min-w-[340px] max-w-[400px] rounded-2xl bg-white p-1.5
            ring-1 ring-slate-200/70 shadow-card-hover
            animate-in fade-in zoom-in-95 duration-150
          "
        >
          <div className="px-3 py-2.5 mb-1 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Notifications
            </div>
            {total > 0 && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {total}
              </span>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-8 text-sm text-slate-500 text-center">
              <div className="inline-flex h-10 w-10 mb-2 rounded-full bg-green-50 text-green-600 items-center justify-center">
                <Bell className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>Tout est en règle, rien à faire dans l'immédiat.</div>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item, idx) => {
                const Icon = ICONS[item.kind];
                // Phase 9 Plan 09-04 — la cle doit etre unique : plusieurs items
                // kind='lead.assigned' peuvent coexister (1 par row Notification).
                // Pour les items derives (4 kinds tenant-wide), `kind` reste unique.
                const key = item.id ?? `${item.kind}-${idx}`;
                return (
                  <li key={key}>
                    <DropdownMenu.Item asChild>
                      <Link
                        href={item.href as any}
                        onClick={() => {
                          // Phase 9 Plan 09-04 — marque la Notification row comme lue
                          // au clic. Fire-and-forget : on ne bloque pas la navigation.
                          // L'item disparait au prochain poll (60s) car readAt != null
                          // exclut la row du findMany cote getNotifications.
                          if (item.id) {
                            void markNotificationRead(item.id);
                          }
                          setOpen(false);
                        }}
                        className="
                          group flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer outline-none
                          data-[highlighted]:bg-slate-50 transition-colors text-sm text-slate-700
                        "
                      >
                        <span
                          className={cn(
                            'inline-flex items-center justify-center h-9 w-9 rounded-xl shrink-0',
                            SEVERITY_CLASSES[item.severity],
                          )}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="flex-1 min-w-0 truncate">{item.label}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-data-[highlighted]:text-slate-500 group-data-[highlighted]:translate-x-0.5 shrink-0 transition-all duration-200" />
                      </Link>
                    </DropdownMenu.Item>
                  </li>
                );
              })}
            </ul>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
