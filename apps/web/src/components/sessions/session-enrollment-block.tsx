'use client';

/**
 * Bloc « Inscriptions en ligne » de la fiche session (spec 2026-08-28).
 *
 * Pilote le lien public : ouvrir, copier, fermer, révoquer. L'état et l'URL
 * sont calculés côté serveur et passés en props — ce composant ne dérive rien.
 *
 * Les confirmations passent par `window.confirm` natif : dans un Radix Dialog,
 * un clic imbriqué peut rester sans effet (feedback_radix_dialog_fallback).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Copy, Check, Lock, RefreshCw, Loader2, Users, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  openSessionEnrollments,
  closeSessionEnrollments,
  revokeSessionEnrollmentLink,
} from '@/server/actions/session-enrollment-admin';
import type { PublicLinkState } from '@/lib/enrollment/public-link';

interface Props {
  sessionId: string;
  etat: PublicLinkState;
  url: string | null;
  participantCount: number;
  pendingCount: number;
  capacityMax: number;
  canWrite: boolean;
}

export function SessionEnrollmentBlock({
  sessionId,
  etat,
  url,
  participantCount,
  pendingCount,
  capacityMax,
  canWrite,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copie, setCopie] = useState(false);
  const [urlCourante, setUrlCourante] = useState(url);

  const placesRestantes = Math.max(0, capacityMax - participantCount - pendingCount);
  const ouvert = etat === 'ouvert';

  // Le lien est construit depuis NEXT_PUBLIC_APP_URL. Ouvert depuis l'instance
  // locale, il pointe sur localhost et n'est diffusable à personne — mieux vaut
  // le dire ici que de le découvrir après l'avoir envoyé à une agence entière.
  const lienLocal = Boolean(
    urlCourante && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(urlCourante),
  );

  async function copier(valeur: string) {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
      toast.success('Lien copié');
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Clipboard refusé (http, permission) : on montre le lien à copier à la main.
      toast.error('Copie impossible — sélectionne le lien et copie-le à la main');
    }
  }

  function ouvrir() {
    startTransition(async () => {
      const r = await openSessionEnrollments(sessionId);
      if (!r.ok) return void toast.error(r.error);
      setUrlCourante(r.url);
      await copier(r.url);
      router.refresh();
    });
  }

  function fermer() {
    if (!window.confirm('Fermer les inscriptions ? Le lien affichera « inscriptions closes ».')) {
      return;
    }
    startTransition(async () => {
      const r = await closeSessionEnrollments(sessionId);
      if (!r.ok) return void toast.error(r.error);
      toast.success('Inscriptions fermées');
      router.refresh();
    });
  }

  function revoquer() {
    if (
      !window.confirm(
        "Révoquer le lien ? L'ancien lien cessera immédiatement de fonctionner, y compris pour les personnes à qui tu l'as déjà envoyé.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await revokeSessionEnrollmentLink(sessionId);
      if (!r.ok) return void toast.error(r.error);
      setUrlCourante(r.url);
      await copier(r.url);
      toast.success('Nouveau lien généré et copié');
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-base inline-flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Inscriptions en ligne
        </h2>
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            ouvert ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
          )}
        >
          {ouvert ? 'Ouvertes' : etat === 'jamais-ouvert' ? 'Jamais ouvertes' : 'Fermées'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        {participantCount} inscrit{participantCount > 1 ? 's' : ''}
        {pendingCount > 0 && ` · ${pendingCount} demande${pendingCount > 1 ? 's' : ''} à traiter`}
        {` · ${placesRestantes} place${placesRestantes > 1 ? 's' : ''} restante${placesRestantes > 1 ? 's' : ''}`}
      </p>

      {ouvert && urlCourante ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={urlCourante}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-muted/40 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => copier(urlCourante)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted"
            >
              {copie ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copie ? 'Copié' : 'Copier'}
            </button>
          </div>
          {lienLocal && (
            <p className="text-xs text-amber-700 inline-flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Ce lien pointe vers ton instance locale : il ne fonctionnera pour personne
              d'autre. Recopie-le depuis l'application en ligne avant de le diffuser.
            </p>
          )}
          {canWrite && (
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={fermer}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Lock className="h-3.5 w-3.5" /> Fermer les inscriptions
              </button>
              <button
                type="button"
                onClick={revoquer}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Révoquer le lien
              </button>
            </div>
          )}
        </>
      ) : (
        canWrite && (
          <button
            type="button"
            onClick={ouvrir}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90',
              pending && 'opacity-70 cursor-wait',
            )}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {etat === 'jamais-ouvert' ? 'Ouvrir aux inscriptions' : 'Rouvrir les inscriptions'}
          </button>
        )
      )}

      {!ouvert && etat !== 'jamais-ouvert' && (
        <p className="text-xs text-muted-foreground">
          {etat === 'complet'
            ? 'La session est complète : le lien affiche « session complète ».'
            : etat === 'session-terminee'
              ? 'La session est terminée ou annulée : le lien est inactif.'
              : 'Le lien existe toujours ; le rouvrir le réactivera sans changer son adresse.'}
        </p>
      )}
    </section>
  );
}
