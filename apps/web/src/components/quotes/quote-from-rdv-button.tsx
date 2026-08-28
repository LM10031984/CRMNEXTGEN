'use client';

/**
 * « Depuis un compte rendu de RDV » — devis rédigé à partir du retranscript.
 *
 * Idée de Laurent (28/08) : au retour d'un rendez-vous, il a le compte rendu,
 * le nombre de jours et le tarif. Le reste — intitulé, argumentaire, modules —
 * se déduit du compte rendu.
 *
 * L'écran ne demande donc QUE ce qu'il sait, et affiche le total avant de
 * lancer : il voit le montant que le client va lire.
 */

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { createQuoteFromRdv } from '@/server/actions/quote-from-rdv';

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function QuoteFromRdvButton() {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [jours, setJours] = useState('');
  const [tarifJourHT, setTarifJourHT] = useState('');
  const [transcript, setTranscript] = useState('');
  const [creerProgramme, setCreerProgramme] = useState(false);

  const nbJours = parseFloat(jours.replace(',', '.')) || 0;
  const tarif = parseFloat(tarifJourHT.replace(',', '.')) || 0;
  const totalHT = nbJours * tarif;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await createQuoteFromRdv({
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim() || null,
        transcript,
        jours: nbJours,
        tarifJourHT: tarif,
        creerProgramme,
      });
      if (!r.ok) {
        // La saisie reste à l'écran : le compte rendu collé ne se retape pas.
        setError(r.error ?? 'Génération impossible');
        return;
      }
      toast.success(
        r.productCode
          ? `Devis ${r.number} créé — programme ${r.productCode} en brouillon`
          : `Devis ${r.number} créé`,
      );
      if (r.productWarning) toast.warning(r.productWarning);
      setOpen(false);
      router.push(`/app/devis/${r.quoteId}`);
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <Sparkles className="h-4 w-4" /> Depuis un compte rendu de RDV
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => !busy && setOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-2xl mt-12 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div>
            <h2 className="font-semibold">Devis depuis un compte rendu de rendez-vous</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vous saisissez le chiffrage, l&apos;IA comprend le besoin et rédige la proposition.
              Les montants viennent de vos champs, jamais du texte généré.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && setOpen(false)}
            className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${ids}-client`} className="text-xs font-medium text-muted-foreground block mb-1">
                Client *
              </label>
              <input
                id={`${ids}-client`}
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Raison sociale ou nom"
                className="w-full h-9 px-3 rounded-md border border-border text-sm"
              />
            </div>
            <div>
              <label htmlFor={`${ids}-email`} className="text-xs font-medium text-muted-foreground block mb-1">
                Email (facultatif)
              </label>
              <input
                id={`${ids}-email`}
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label htmlFor={`${ids}-jours`} className="text-xs font-medium text-muted-foreground block mb-1">
                Nombre de jours *
              </label>
              <input
                id={`${ids}-jours`}
                type="number"
                min="0.5"
                step="0.5"
                required
                value={jours}
                onChange={(e) => setJours(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border text-sm"
              />
            </div>
            <div>
              <label htmlFor={`${ids}-tarif`} className="text-xs font-medium text-muted-foreground block mb-1">
                Tarif journalier HT *
              </label>
              <input
                id={`${ids}-tarif`}
                type="number"
                min="1"
                step="10"
                required
                value={tarifJourHT}
                onChange={(e) => setTarifJourHT(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border text-sm"
              />
            </div>
            <div className="rounded-md bg-muted/40 border border-border px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Total du devis</div>
              <div className="text-sm font-semibold tabular-nums">
                {totalHT > 0 ? `${eur.format(totalHT)} HT` : '—'}
              </div>
              {nbJours > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  soit {nbJours * 8} h de formation
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`${ids}-cr`} className="text-xs font-medium text-muted-foreground block mb-1">
              Compte rendu du rendez-vous *
            </label>
            <textarea
              id={`${ids}-cr`}
              required
              rows={9}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Collez ici la retranscription ou vos notes de rendez-vous — tel quel, digressions comprises."
              className="w-full px-3 py-2 rounded-md border border-border text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              L&apos;IA en extrait le besoin, les objectifs et les modules, puis rédige
              l&apos;argumentaire adressé au client. Elle n&apos;invente ni chiffre, ni date,
              ni promesse de résultat.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={creerProgramme}
              onChange={(e) => setCreerProgramme(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Créer aussi le <strong>programme de formation</strong> (brouillon)
              <span className="block text-xs text-muted-foreground">
                Monté à partir des modules compris en rendez-vous. Il reste en brouillon tant que
                vous ne l&apos;avez pas relu — la génération des conventions reste bloquée d&apos;ici là.
              </span>
            </span>
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => !busy && setOpen(false)}
              className="h-9 px-3 rounded-md border border-border text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Rédaction en cours…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" /> Générer le devis
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
