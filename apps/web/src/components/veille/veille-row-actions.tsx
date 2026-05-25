'use client';

/**
 * Kebab menu d'actions par ligne du tableau veille (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * 2 actions :
 *  - Modifier  → ouvre <EditVeilleDialog> (Radix Dialog + RHF + updateWatchSchema)
 *  - Archiver  → appelle `archiveWatch(id)` directement (pas de confirm Dialog — soft-delete,
 *               réversible côté BDD si besoin via un futur outil admin).
 *
 * Pattern Radix DropdownMenu cohérent avec `user-row-actions.tsx` (Phase 8 utilisateurs).
 *
 * RBAC : le bouton kebab n'est rendu QUE si `canEdit=true` côté parent (VeilleTable) —
 * le LECTEUR ne voit pas du tout cette colonne.
 */

import { useState, useTransition } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, Pencil, Archive } from 'lucide-react';
import { toast } from 'sonner';
import type { RegulatoryWatch } from '@qualiof/db';
import { archiveWatch } from '@/server/actions/veille';
import { EditVeilleDialog } from './edit-veille-dialog';

interface VeilleRowActionsProps {
  watch: RegulatoryWatch;
}

export function VeilleRowActions({ watch }: VeilleRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onArchive() {
    if (pending) return;
    startTransition(async () => {
      const r = await archiveWatch(watch.id);
      if (r.ok) {
        toast.success('Source archivée');
      } else {
        toast.error(r.error || 'Erreur archivage');
      }
    });
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Actions sur cette source de veille"
            title="Actions"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            disabled={pending}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[160px] rounded-md border border-border bg-white p-1 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                setEditOpen(true);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer outline-none hover:bg-muted focus:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                onArchive();
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer outline-none hover:bg-muted focus:bg-muted text-amber-700"
            >
              <Archive className="h-3.5 w-3.5" />
              Archiver
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <EditVeilleDialog
        watch={watch}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
