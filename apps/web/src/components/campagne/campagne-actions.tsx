'use client';

/**
 * Les gestes de l'admin sur une campagne : le lien, les dates, l'ouverture.
 *
 * Le lien régénéré s'affiche UNE fois, ici, et n'est plus jamais relisible :
 * seule son empreinte est stockée. C'est pourquoi il apparaît dans un encadré
 * qui le dit explicitement plutôt que dans un toast qui disparaît au bout de
 * trois secondes.
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Copy, Check, Star } from 'lucide-react';
import {
  regenerateCampagneToken,
  setCampagneStatus,
  retenirDate,
} from '@/server/actions/campagnes';

interface DateLigne {
  id: string;
  texte: string;
  /** « 1 demi-journée · 4 h sur site · 8 h conventionnées » — même phrase partout. */
  creneau: string;
  label: string | null;
  isRetained: boolean;
  voix: number;
}

export function CampagneActions({
  batchId,
  status,
  dateOptions,
}: {
  batchId: string;
  status: string;
  dateOptions: DateLigne[];
}) {
  const [isPending, startTransition] = useTransition();
  const [lien, setLien] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  function regenerer() {
    startTransition(async () => {
      const r = await regenerateCampagneToken(batchId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLien(r.data?.url ?? null);
      toast.success('Nouveau lien émis — l’ancien ne fonctionne plus.');
    });
  }

  function changerStatut(next: 'OUVERTE' | 'CLOTUREE' | 'ANNULEE') {
    startTransition(async () => {
      const r = await setCampagneStatus(batchId, next);
      if (!r.ok) toast.error(r.error);
      else toast.success('Campagne mise à jour.');
    });
  }

  function basculerDate(dateOptionId: string) {
    startTransition(async () => {
      const r = await retenirDate(batchId, dateOptionId);
      if (!r.ok) toast.error(r.error);
    });
  }

  async function copier() {
    if (!lien) return;
    await navigator.clipboard.writeText(lien);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h2 className="text-sm font-semibold">Le lien à diffuser</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={regenerer}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Régénérer le lien
            </button>
            {status === 'OUVERTE' ? (
              <>
                <button
                  type="button"
                  onClick={() => changerStatut('CLOTUREE')}
                  disabled={isPending}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Clôturer
                </button>
                <button
                  type="button"
                  onClick={() => changerStatut('ANNULEE')}
                  disabled={isPending}
                  className="rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  Révoquer
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => changerStatut('OUVERTE')}
                disabled={isPending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Rouvrir
              </button>
            )}
          </div>
        </div>

        {lien ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-900">
              Copiez-le maintenant : il ne sera plus affiché.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white/70 px-2 py-1.5 text-xs">
                {lien}
              </code>
              <button
                type="button"
                onClick={copier}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-white"
              >
                {copie ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copie ? 'Copié' : 'Copier'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Le lien n’est affiché qu’à l’émission — seule son empreinte est conservée. S’il est
            perdu, régénérez-le : l’ancien cessera alors de fonctionner.
          </p>
        )}
      </section>

      {dateOptions.length > 0 ? (
        <section className="rounded-xl border border-border bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">Les dates proposées</h2>
          <ul className="divide-y divide-border">
            {dateOptions.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">{d.texte}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{d.creneau}</div>
                  {d.label ? (
                    <div className="text-xs text-muted-foreground">{d.label}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {d.voix} choix
                  </span>
                  <button
                    type="button"
                    onClick={() => basculerDate(d.id)}
                    disabled={isPending}
                    aria-pressed={d.isRetained}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${
                      d.isRetained
                        ? 'border-primary bg-primary-50 text-primary-800'
                        : 'border-border hover:bg-slate-50'
                    }`}
                  >
                    <Star className={`h-3.5 w-3.5 ${d.isRetained ? 'fill-current' : ''}`} />
                    {d.isRetained ? 'Retenue' : 'Retenir'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Une seule date retenue à la fois : c’est elle qui commande la deadline annoncée aux
            participants, et deux dates retenues donneraient deux deadlines.
          </p>
        </section>
      ) : null}
    </div>
  );
}
