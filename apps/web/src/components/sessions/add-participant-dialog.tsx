'use client';

/**
 * Modale "Inscrire un apprenant" sur la fiche session.
 * Utilise le <PersonOrOrgPicker> pour gérer le cas EI/multi-casquettes.
 */

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { PersonOrOrgPicker, type PickerSelection } from '@/components/pickers/person-or-org-picker';
import { QuickCreatePersonButton } from '@/components/wizards/quick-create-person';
import { addParticipant } from '@/server/actions/sessions';
import { parsePriceInput } from '@/lib/pricing/parse-price-input';

interface Props {
  sessionId: string;
  /** Tarif de la session, `null` si elle n'en porte pas : le champ reste alors
   *  vide et la cascade tarifaire décide (jamais un 0 pré-rempli). */
  defaultPrice: number | null;
  excludePersonIds: string[];
}

export function AddParticipantDialog({ sessionId, defaultPrice, excludePersonIds }: Props) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<PickerSelection | null>(null);
  // Nom pré-rempli dans le picker après création express d'un apprenant, pour
  // qu'il apparaisse directement dans les résultats (même mécanique que le
  // wizard session, BUG-7).
  const [pickerQuery, setPickerQuery] = useState<string | null>(null);
  const [price, setPrice] = useState<string>(defaultPrice === null ? '' : String(defaultPrice));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!selection) return;
    setError(null);
    startTransition(async () => {
      const res = await addParticipant({
        sessionId,
        personId: selection.personId,
        sponsorOrgId: selection.sponsorOrgId,
        // Champ vide ⇒ `undefined` : la cascade tarifaire décide. Envoyer 0
        // ici la court-circuiterait (`input.priceHT ?? défaut`) et créerait un
        // inscrit à 0 € — E-2 rouvert par l'interface.
        priceHT: parsePriceInput(price),
        // Le picker sait désormais rattacher une entreprise à un apprenant qui
        // n'en avait aucune : on transmet le rôle retenu, pour que l'action
        // crée le LegalLink manquant plutôt que de refuser l'inscription.
        legalLinkRole: selection.role as Parameters<typeof addParticipant>[0]['legalLinkRole'],
      });
      if (res.ok) {
        setOpen(false);
        setSelection(null);
        setPrice(defaultPrice === null ? '' : String(defaultPrice));
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
      >
        <Plus className="h-4 w-4" /> Inscrire un apprenant
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-foreground/30 z-40"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pointer-events-none overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-lg pointer-events-auto mt-16 mb-8">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div>
              <h2 className="font-semibold">Inscrire un apprenant</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pour les apprenants multi-casquettes (EI), tu choisiras la bonne organisation à payer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Apprenant
              </label>
              <PersonOrOrgPicker
                key={pickerQuery ?? 'initial'}
                value={selection}
                onChange={setSelection}
                excludePersonIds={excludePersonIds}
                defaultQuery={pickerQuery ?? undefined}
                autoFocus
              />
              {/* 28/08 — l'apprenant n'existe pas encore : le créer ICI plutôt
                  que de quitter la session pour /app/apprenants et revenir. */}
              {!selection && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Il n&apos;est pas encore dans la base ?
                  </span>
                  <QuickCreatePersonButton
                    onCreated={(p) => setPickerQuery(`${p.lastName} ${p.firstName}`)}
                  />
                </div>
              )}
            </div>

            {selection && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Tarif HT (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Hérite du prix par apprenant de la session ({defaultPrice} €). Modifiable.
                </p>
              </div>
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-5 border-t border-border">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-4 rounded-md text-sm font-medium border border-border hover:bg-muted/30"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selection || pending}
              className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? 'Inscription…' : 'Inscrire'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
