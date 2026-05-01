'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updateSessionStatus, type SessionStatus } from '@/server/actions/sessions-create';

const LABELS: Record<SessionStatus, { label: string; classes: string }> = {
  DRAFT: { label: 'Brouillon', classes: 'bg-slate-50 text-slate-600 border-slate-200' },
  PLANNED: { label: 'Planifiée', classes: 'bg-sky-50 text-sky-700 border-sky-200' },
  OPEN: { label: 'Ouverte', classes: 'bg-sky-50 text-sky-700 border-sky-200' },
  VALIDATED: { label: 'Validée', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  IN_PROGRESS: { label: 'En cours', classes: 'bg-primary-50 text-primary-700 border-primary-100' },
  COMPLETED: { label: 'Terminée', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Annulée', classes: 'bg-red-50 text-red-700 border-red-200' },
};

const ALL_STATUSES: SessionStatus[] = ['DRAFT', 'PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export function SessionStatusBadgeMenu({
  sessionId,
  status,
  sessionCode,
}: {
  sessionId: string;
  status: SessionStatus;
  sessionCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const current = LABELS[status];

  function onSelect(next: SessionStatus) {
    if (next === status) return;
    startTransition(async () => {
      const r = await updateSessionStatus(sessionId, next);
      if ('ok' in r && r.ok) {
        toast.success(`${sessionCode} → ${LABELS[next].label}`);
        router.refresh();
      } else {
        toast.error(`Erreur : ${'error' in r ? r.error : 'inconnue'}`);
      }
    });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap transition-colors hover:brightness-95 disabled:opacity-50',
            current.classes,
          )}
          aria-label={`Statut ${current.label}, cliquer pour changer`}
        >
          {current.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[160px] rounded-md border border-border bg-white p-1 shadow-lg animate-in fade-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {ALL_STATUSES.map((s) => {
            const isCurrent = s === status;
            return (
              <DropdownMenu.Item
                key={s}
                disabled={pending}
                onSelect={() => onSelect(s)}
                className={cn(
                  'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-sm cursor-pointer outline-none',
                  'data-[highlighted]:bg-muted',
                  isCurrent && 'font-medium',
                )}
              >
                <span>{LABELS[s].label}</span>
                {isCurrent && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
