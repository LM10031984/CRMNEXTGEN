'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Layers, List } from 'lucide-react';

/**
 * Toggle Mode flat / Mode groupé. Quand activé, la liste regroupe les
 * inscriptions partageant (sessionId + sponsorOrgId) sous une ligne
 * parent expandable. Action « Facturer le groupe » émet 1 facture
 * multi-lignes.
 */
export function GroupModeToggle() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const grouped = sp.get('group') === '1';

  function setGrouped(next: boolean) {
    const params = new URLSearchParams(sp.toString());
    if (next) params.set('group', '1');
    else params.delete('group');
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-white text-xs h-9 overflow-hidden">
      <button
        type="button"
        onClick={() => setGrouped(false)}
        className={`inline-flex items-center gap-1.5 px-3 h-full transition-colors ${
          !grouped ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/40'
        }`}
        title="Une ligne par inscription"
      >
        <List className="h-3.5 w-3.5" /> Détaillé
      </button>
      <button
        type="button"
        onClick={() => setGrouped(true)}
        className={`inline-flex items-center gap-1.5 px-3 h-full transition-colors ${
          grouped ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/40'
        }`}
        title="Regroupe par sponsor + session"
      >
        <Layers className="h-3.5 w-3.5" /> Groupé
      </button>
    </div>
  );
}
