'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, Inbox, AlertTriangle, AlertCircle, Users, ChevronRight, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNotifications, type NotificationItem, type NotificationKind } from '@/server/actions/notifications';
import { markNotificationRead } from '@/server/actions/notification-mark-read';

const ICONS: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  preinscription: Inbox,
  session_no_attendee: AlertTriangle,
  session_to_close: AlertCircle,
  cleanup: Users,
  'lead.assigned': UserPlus,
};

const SEVERITY_CLASSES: Record<NotificationItem['severity'], string> = {
  info: 'text-sky-700 bg-sky-50 border-sky-200',
  warning: 'text-amber-800 bg-amber-50 border-amber-200',
  danger: 'text-red-700 bg-red-50 border-red-200',
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
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold tabular-nums">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[320px] max-w-[380px] rounded-lg border border-border bg-white shadow-xl p-1 animate-in fade-in zoom-in-95"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications {total > 0 ? `· ${total}` : ''}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center italic">
              Tout est en règle, rien à faire dans l'immédiat.
            </div>
          ) : (
            <ul className="py-1">
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
                        className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer outline-none data-[highlighted]:bg-muted text-sm"
                      >
                        <span
                          className={cn(
                            'inline-flex items-center justify-center h-7 w-7 rounded-full border shrink-0',
                            SEVERITY_CLASSES[item.severity],
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 min-w-0 truncate">{item.label}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
