'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionStatus } from '@qualiof/db';
import { updateSessionStatus } from '@/server/actions/sessions';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Variant = 'success' | 'info' | 'warning' | 'muted' | 'danger' | 'primary';

const STATUSES: {
  value: SessionStatus;
  label: string;
  variant: Variant;
  hint?: string;
}[] = [
  { value: 'DRAFT', label: 'Brouillon', variant: 'muted', hint: 'Création en cours' },
  { value: 'PLANNED', label: 'Planifiée', variant: 'info', hint: 'Date confirmée, pas encore ouverte' },
  { value: 'OPEN', label: 'Ouverte', variant: 'info', hint: 'Inscriptions ouvertes' },
  { value: 'VALIDATED', label: 'Validée', variant: 'success', hint: 'Conventions signées' },
  { value: 'IN_PROGRESS', label: 'En cours', variant: 'primary', hint: 'Formation démarrée' },
  { value: 'COMPLETED', label: 'Terminée', variant: 'success', hint: 'Formation achevée' },
  { value: 'CANCELLED', label: 'Annulée', variant: 'danger', hint: 'Session annulée' },
];

interface Props {
  sessionId: string;
  currentStatus: SessionStatus;
}

export function SessionStatusSelect({ sessionId, currentStatus }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = STATUSES.find((s) => s.value === currentStatus) ?? {
    value: currentStatus,
    label: currentStatus,
    variant: 'muted' as Variant,
  };

  function handlePick(next: SessionStatus) {
    if (next === currentStatus) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const r = await updateSessionStatus({ sessionId, newStatus: next });
      if (r.ok) {
        if (r.autoPackTriggered) {
          // Cas: COMPLETED déclenche la génération du pack fin de formation.
          // L'utilisateur recevra un email quand le pack sera prêt (5-10 min).
          toast.success('Session terminée — pack fin de formation lancé', {
            description: 'Tu recevras un email quand les documents seront prêts.',
            duration: 7000,
          });
        } else {
          toast.success(`Statut mis à jour : ${STATUSES.find((s) => s.value === next)?.label ?? next}`);
        }
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Échec mise à jour statut');
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md hover:bg-muted/40 px-1 py-0.5 -mx-1 -my-0.5 transition-colors"
        title="Changer le statut"
      >
        <Badge variant={current.variant}>{current.label}</Badge>
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-40 w-64 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
              Changer le statut
            </div>
            <div className="py-1">
              {STATUSES.map((s) => {
                const active = s.value === currentStatus;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => handlePick(s.value)}
                    className={cn(
                      'w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-muted/30 transition-colors',
                      active && 'bg-muted/40',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 mt-1 shrink-0',
                        active ? 'text-primary' : 'text-transparent',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      {s.hint && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
