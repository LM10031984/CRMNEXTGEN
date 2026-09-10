/**
 * « À rappeler aujourd'hui » — le J+1 du stand, en haut de la liste des leads.
 *
 * Le problème qu'elle résout : le 10 septembre au matin il y a 60 à 100 leads
 * du salon, tous « nouveaux », tous de la veille. Les rappeler dans l'ordre
 * d'arrivée gaspille les meilleurs. Ceux-là — priorité A ET rappel demandé
 * cette semaine — sont les seuls à qui on a promis un appel à date : l'appel ne
 * s'ouvre pas par « je me permets de vous appeler » mais par « vous m'aviez dit
 * cette semaine ». Ce n'est plus du démarchage, c'est un rendez-vous tenu.
 *
 * Elle disparaît d'elle-même quand il n'y a personne à rappeler — un bloc vide
 * en permanence finit par ne plus être lu.
 *
 * Composant serveur : aucune interactivité, seulement des liens `tel:` qui
 * ouvrent le téléphone d'un tap depuis un mobile.
 */

import Link from 'next/link';
import { Phone, PhoneCall } from 'lucide-react';
import { estARappelerMaintenant } from '@/lib/diagnostic/priorite';

export interface LeadARappeler {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  lastAction: string | null;
}

/** Ce qui suit le dernier tiret cadratin de la ligne de suivi : l'axe du diagnostic. */
function axeDepuisSuivi(lastAction: string | null): string | null {
  const m = /^\[[ABC]\] Diagnostic — (.+) — .+$/.exec((lastAction ?? '').trim());
  return m ? m[1]! : null;
}

export function RappelsDuJour({ leads }: { leads: LeadARappeler[] }) {
  const aRappeler = leads.filter((l) => estARappelerMaintenant(l.lastAction));
  if (aRappeler.length === 0) return null;

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <PhoneCall className="h-4 w-4 text-primary shrink-0" />
        <h2 className="text-sm font-semibold">
          À rappeler aujourd'hui
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {aRappeler.length} prospect{aRappeler.length > 1 ? 's' : ''} vous {aRappeler.length > 1 ? 'ont' : 'a'} demandé
            un appel cette semaine
          </span>
        </h2>
      </div>

      <ul className="divide-y divide-border/60 rounded-lg border border-border bg-white">
        {aRappeler.map((l) => {
          const nom = `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || 'Prospect';
          const axe = axeDepuisSuivi(l.lastAction);
          return (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <Link
                  href={`/app/leads/${l.id}` as any}
                  className="text-sm font-medium hover:underline"
                >
                  {nom}
                </Link>
                {axe && <div className="text-xs text-muted-foreground truncate">{axe}</div>}
              </div>
              {l.phone ? (
                <a
                  href={`tel:${l.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {l.phone}
                </a>
              ) : (
                // Ne devrait pas arriver : le téléphone est obligatoire quand on
                // demande « cette semaine ». Si ça arrive, il faut le VOIR.
                <span className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                  sans téléphone
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        Le script d'appel est sur chaque fiche — ouvrez-la avant de composer.
      </p>
    </section>
  );
}
