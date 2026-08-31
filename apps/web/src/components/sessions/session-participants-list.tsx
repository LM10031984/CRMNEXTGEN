'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserMinus, Loader2, ExternalLink, Users } from 'lucide-react';
import { toast } from 'sonner';
import { unenrollParticipant } from '@/server/actions/sessions';
import { EditParticipantButton } from './edit-participant-button';
import { withFrom } from '@/lib/nav/from-link';

export interface SessionParticipantRow {
  id: string;
  personId: string;
  fullName: string;
  sponsorOrgLabel: string | null;
  docCount?: number;
  docTotal?: number;
  // Champs inscription éditables (audit 2026-08-12) — optionnels pour ne pas
  // casser les appels existants ; le bouton Éditer n'apparaît que s'ils sont là.
  priceHT?: number;
  enrollmentStatus?: string;
  financingMode?: string | null;
  financingRequestDate?: Date | string | null;
}

/**
 * Liste nominative des apprenants inscrits à une session, avec désinscription.
 *
 * Pourquoi ce composant existe : la page session n'affichait qu'un COMPTEUR
 * ("3 apprenants") + la matrice 14 colonnes où le menu d'actions était enterré
 * hors écran à droite — impossible de voir les inscrits ni de les désinscrire
 * (frustration Laurent 15/06). Ici : noms visibles, bouton "Désinscrire"
 * explicite, confirmation NATIVE (window.confirm — pas de Dialog Radix qui
 * avale les clics dans ce repo).
 */
export function SessionParticipantsList({
  participants,
  canManage,
}: {
  participants: SessionParticipantRow[];
  canManage: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleUnenroll(p: SessionParticipantRow) {
    if (
      !window.confirm(
        `Désinscrire ${p.fullName} de la session ?\n\n` +
          `L'inscription sera supprimée. Les documents déjà générés (convention, ` +
          `programme, AGEFICE…) restent disponibles dans la fiche apprenant.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const r = await unenrollParticipant(p.id);
        if (r.ok) {
          toast.success(`${p.fullName} désinscrit(e) de la session`);
          router.refresh();
        } else {
          toast.error(r.error ?? 'Erreur lors de la désinscription');
        }
      } catch (e) {
        toast.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          Apprenants inscrits ({participants.length})
        </h3>
      </div>
      {participants.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          Aucun apprenant inscrit pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <Link
                  href={withFrom(`/app/apprenants/${p.personId}`, pathname) as any}
                  className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                >
                  {p.fullName}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
                {p.sponsorOrgLabel && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.sponsorOrgLabel}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {typeof p.docCount === 'number' && typeof p.docTotal === 'number' && (
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {p.docCount}/{p.docTotal} docs
                  </span>
                )}
                {canManage && typeof p.priceHT === 'number' && p.enrollmentStatus && (
                  <EditParticipantButton
                    participantId={p.id}
                    currentPriceHT={p.priceHT}
                    currentStatus={p.enrollmentStatus}
                    currentFinancingRequestDate={p.financingRequestDate ?? null}
                    currentFinancingMode={p.financingMode ?? null}
                  />
                )}
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleUnenroll(p)}
                    title={`Désinscrire ${p.fullName}`}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserMinus className="h-3.5 w-3.5" />
                    )}
                    Désinscrire
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
