'use client';

/**
 * Créer une campagne — et surtout, montrer son lien UNE fois.
 *
 * Le formulaire ne redirige pas après création, contrairement à l'habitude.
 * C'est délibéré : le token brut n'existe qu'à cet instant, seule son empreinte
 * étant stockée. Une redirection l'emporterait avec elle, et il faudrait déjà
 * régénérer. L'écran reste donc sur le lien, avec un bouton « copier », tant
 * que l'utilisateur n'a pas décidé d'aller ailleurs.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Copy, Check } from 'lucide-react';
import { createCampagne } from '@/server/actions/campagnes';

interface Produit {
  id: string;
  title: string;
  durationHours: number | null;
}

interface DateSaisie {
  cle: string;
  jour: string;
  debut: string;
  fin: string;
  label: string;
}

function nouvelleDate(): DateSaisie {
  return { cle: crypto.randomUUID(), jour: '', debut: '09:00', fin: '17:00', label: '' };
}

export function NouvelleCampagneForm({
  produits,
  diagnosticId,
  libelleSuggere,
  effectifSuggere,
}: {
  produits: Produit[];
  diagnosticId: string | null;
  libelleSuggere: string;
  effectifSuggere: number;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [label, setLabel] = useState(libelleSuggere);
  const [productId, setProductId] = useState('');
  const [effectif, setEffectif] = useState(String(effectifSuggere || ''));
  const [validite, setValidite] = useState('30');
  const [dates, setDates] = useState<DateSaisie[]>([nouvelleDate()]);
  const [lien, setLien] = useState<{ url: string; id: string } | null>(null);
  const [copie, setCopie] = useState(false);

  function creer() {
    const dateOptions = dates
      .filter((d) => d.jour)
      .map((d) => ({
        // Des `Date` et non des chaînes : le schéma serveur les attend ainsi,
        // et les objets Date traversent proprement la frontière serveur.
        startsAt: new Date(`${d.jour}T${d.debut || '09:00'}:00`),
        endsAt: new Date(`${d.jour}T${d.fin || '17:00'}:00`),
        label: d.label || null,
      }));

    start(async () => {
      const r = await createCampagne({
        label,
        diagnosticId,
        productId: productId || null,
        effectifAttendu: Number(effectif) || 0,
        validityDays: Number(validite) || 30,
        dateOptions,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLien({ url: r.data!.url, id: r.data!.id });
      toast.success('Campagne créée — copiez le lien, il ne sera plus affiché.');
    });
  }

  async function copier() {
    if (!lien) return;
    await navigator.clipboard.writeText(lien.url);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  if (lien) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            Le lien de la campagne — affiché une seule fois
          </h2>
          <p className="text-sm text-amber-800/90 mt-1">
            Seule son empreinte est conservée : cette page est le seul endroit où il apparaîtra.
            Copiez-le maintenant et transmettez-le au dirigeant.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white/70 px-3 py-2 text-sm">
              {lien.url}
            </code>
            <button
              type="button"
              onClick={copier}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-white"
            >
              {copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copie ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/app/campagnes/${lien.id}` as Route}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white"
          >
            Ouvrir la campagne
          </Link>
          <button
            type="button"
            onClick={() => router.push('/app/campagnes' as Route)}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-white p-5">
      <label className="block">
        <span className="text-sm font-medium">Libellé de la campagne</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="RDV OPTIMMO — R2 du 24/09"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Pour vous : c’est ce qui identifie la campagne dans la liste. Le participant, lui, voit le
          nom de la formation.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Formation pressentie</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 bg-white"
          >
            <option value="">— à préciser plus tard —</option>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.durationHours ? ` · ${p.durationHours} h` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Participants attendus</span>
          <input
            type="number"
            min={0}
            value={effectif}
            onChange={(e) => setEffectif(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          />
        </label>
      </div>

      <label className="block max-w-xs">
        <span className="text-sm font-medium">Validité du lien (jours)</span>
        <input
          type="number"
          min={1}
          max={365}
          value={validite}
          onChange={(e) => setValidite(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Dates prévisionnelles</legend>
        <p className="text-xs text-muted-foreground">
          Les participants pourront exprimer leur préférence. C’est la date la plus proche qui fixe
          la deadline de dépôt des pièces annoncée à l’équipe.
        </p>
        {dates.map((d, i) => (
          <div key={d.cle} className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">Jour</span>
              <input
                type="date"
                value={d.jour}
                onChange={(e) =>
                  setDates((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, jour: e.target.value } : x)),
                  )
                }
                className="mt-0.5 block rounded-lg border border-border px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Début</span>
              <input
                type="time"
                value={d.debut}
                onChange={(e) =>
                  setDates((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, debut: e.target.value } : x)),
                  )
                }
                className="mt-0.5 block rounded-lg border border-border px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Fin</span>
              <input
                type="time"
                value={d.fin}
                onChange={(e) =>
                  setDates((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)),
                  )
                }
                className="mt-0.5 block rounded-lg border border-border px-3 py-2"
              />
            </label>
            <label className="block flex-1 min-w-[10rem]">
              <span className="text-xs text-muted-foreground">Intitulé (facultatif)</span>
              <input
                value={d.label}
                onChange={(e) =>
                  setDates((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
                placeholder="Journée 1 — dans vos locaux"
                className="mt-0.5 block w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
            {dates.length > 1 ? (
              <button
                type="button"
                onClick={() => setDates((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Retirer cette date"
                className="rounded-lg border border-border p-2 hover:bg-slate-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
        {dates.length < 6 ? (
          <button
            type="button"
            onClick={() => setDates((prev) => [...prev, nouvelleDate()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter une date
          </button>
        ) : null}
      </fieldset>

      <button
        type="button"
        onClick={creer}
        disabled={isPending || label.trim().length < 3}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Créer la campagne et son lien
      </button>
    </div>
  );
}
