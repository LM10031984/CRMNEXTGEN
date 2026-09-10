'use client';

/**
 * Le formulaire de la page `/rdv/[token]` — trois champs, pas un de plus.
 *
 * Il ne demande que ce qui sert à FABRIQUER le lien individuel : prénom, nom,
 * email. Tout le reste — date de naissance, statut, SIRET, pièces — se saisit
 * ensuite sur `/preinscription/[token]`, dans le formulaire existant. Demander
 * deux fois les mêmes informations est le meilleur moyen d'en obtenir deux
 * versions différentes.
 *
 * Le choix de date est facultatif : quelqu'un qui hésite doit pouvoir avancer.
 * Une date non choisie ici se rattrape en rendez-vous, un dossier bloqué non.
 */

import { useState, useTransition } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { demanderLienPreinscription } from '@/server/actions/campagne-public';

interface DateOption {
  id: string;
  label: string | null;
  texte: string;
  /** « 09:00 – 13:00 » — ce que le participant doit bloquer dans son agenda. */
  horaire: string;
  /** « 1 demi-journée · 4 h sur site · 8 h conventionnées » — même phrase que côté admin. */
  creneau: string;
  isRetained: boolean;
}

export function RdvForm({ token, dateOptions }: { token: string; dateOptions: DateOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOptionId, setDateOptionId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const complet = firstName.trim() && lastName.trim() && email.trim().includes('@');

  function envoyer() {
    setErreur(null);
    startTransition(async () => {
      const r = await demanderLienPreinscription({
        token,
        firstName,
        lastName,
        email,
        dateOptionId,
      });
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      // Redirection dure et non `router.push` : on quitte une page publique
      // pour une autre, il n'y a aucun état client à préserver, et un
      // rafraîchissement complet garantit que le formulaire de pré-inscription
      // démarre propre.
      window.location.href = r.url;
    });
  }

  return (
    <div className="space-y-5">
      {dateOptions.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">
            Quelle date vous arrangerait ?{' '}
            <span className="font-normal text-muted-foreground">(facultatif)</span>
          </legend>
          <div className="grid gap-2">
            {dateOptions.map((d) => {
              const choisie = dateOptionId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDateOptionId(choisie ? null : d.id)}
                  aria-pressed={choisie}
                  className={`text-left rounded-xl border px-4 py-3 transition ${
                    choisie
                      ? 'border-primary bg-primary-50 ring-1 ring-primary'
                      : 'border-border bg-white hover:border-primary/40'
                  }`}
                >
                  <div className="font-medium capitalize">
                    {d.texte} <span className="tabular-nums">· {d.horaire}</span>
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">{d.creneau}</div>
                  {d.label ? (
                    <div className="text-sm text-muted-foreground">{d.label}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Prénom</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Nom</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          C&apos;est l&apos;adresse à laquelle votre convocation sera envoyée. Si vous revenez plus
          tard avec la même adresse, vous retrouverez votre dossier là où vous l&apos;avez laissé.
        </span>
      </label>

      {erreur ? (
        <p role="alert" className="text-sm rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-red-800">
          {erreur}
        </p>
      ) : null}

      <button
        type="button"
        onClick={envoyer}
        disabled={!complet || isPending}
        className="w-full min-h-[56px] rounded-xl bg-primary text-white font-semibold text-base inline-flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Préparation de votre dossier…
          </>
        ) : (
          <>
            Constituer mon dossier <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
