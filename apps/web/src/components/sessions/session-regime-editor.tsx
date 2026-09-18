'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setSessionRegime } from '@/server/actions/session-regime';
import type { SessionRegime } from '@/lib/sessions/session-regime';

export function SessionRegimeEditor({
  sessionId,
  regime,
  price,
}: {
  sessionId: string;
  regime: SessionRegime | null;
  price: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<SessionRegime | ''>(regime ?? '');
  const [amount, setAmount] = useState(price === null ? '' : String(price));
  const [key, setKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      if (!chosen) {
        setError('Choisissez le régime de la session.');
        return;
      }
      const result = await setSessionRegime({
        sessionId,
        regime: chosen,
        priceHT: Number(amount.replace(',', '.')),
        apply: !!key,
        confirmationKey: key,
      });
      if (!result.ok) {
        setError(result.error);
        setKey(undefined);
        return;
      }
      if (result.changed || !result.confirmationKey) {
        setOpen(false);
        setKey(undefined);
        router.refresh();
      } else {
        setKey(result.confirmationKey);
        setError(undefined);
      }
    });
  return (
    <div className="text-sm">
      {!open ? (
        <button type="button" className="text-primary" onClick={() => setOpen(true)}>
          {regime === 'ENTREPRISE'
            ? `Entreprise · ${price?.toLocaleString('fr-FR')} € HT au total`
            : regime === 'INDIVIDUEL'
              ? `Individuel · ${price?.toLocaleString('fr-FR')} € HT / stagiaire`
              : 'Régime non déclaré · Définir'}
        </button>
      ) : (
        <div className="my-2 space-y-2 rounded border border-border bg-white p-3">
          <label className="block">
            Régime de la session
            <select
              disabled={pending || !!key}
              className="mt-1 w-full rounded border p-2"
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value as SessionRegime);
                setAmount('');
              }}
            >
              <option value="">Choisir…</option>
              <option value="ENTREPRISE">Entreprise — convention et prix total</option>
              <option value="INDIVIDUEL">Individuel — contrat et prix par stagiaire</option>
            </select>
          </label>
          <label className="block">
            {chosen === 'ENTREPRISE' ? 'Prix total HT (€)' : 'Prix HT par stagiaire (€)'}
            <input
              disabled={pending || !!key}
              className="mt-1 w-full rounded border p-2"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {key && (
            <p role="status">
              Appliquer {chosen === 'ENTREPRISE' ? 'le forfait total' : 'le prix par stagiaire'} de{' '}
              {amount} € HT à cette session ? Les documents existants ne sont pas régénérés.
            </p>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              disabled={pending}
              type="button"
              onClick={submit}
              className="font-medium text-primary"
            >
              {pending ? 'Vérification…' : key ? 'Confirmer' : 'Prévisualiser'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setKey(undefined);
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
