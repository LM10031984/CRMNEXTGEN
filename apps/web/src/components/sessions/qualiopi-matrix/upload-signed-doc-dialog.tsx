'use client';

/**
 * Phase 9.1 Plan 02 Task 3 — compound `<UploadSignedDocDialog>`.
 *
 * Radix Dialog modale centrée (NOT slide-over — UI-SPEC §Component Contracts).
 * Width w-[480px] max-w-[90vw]. Pattern réutilisé de `ReassignLeadButton` Phase 9.
 *
 * Validation client redondante côté server (defense in depth) :
 *  - mime === 'application/pdf'
 *  - size ≤ 10 Mo (MAX_BYTES = 10 * 1024 * 1024)
 *
 * Soumet FormData → server action `uploadSignedDoc` (Plan 02 Task 1).
 *
 * A11y : Dialog.Title + Description aria-labelledby/describedby (Radix natif),
 *        label htmlFor sur file input, role="alert" sur message d'erreur.
 *
 * Copywriting EXACT UI-SPEC §Copywriting Contract :
 *  - Title "Téléverser le PDF signé"
 *  - submit "Téléverser" → "Téléversement…" en pending
 *  - "Format PDF · max 10 Mo"
 *  - "Fichier trop volumineux (max 10 Mo)." (error)
 *  - "Format non supporté. Le fichier doit être un PDF." (error)
 */

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, Loader2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { uploadSignedDoc } from '@/server/actions/qualiopi-matrix';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * « Une pièce, un seul chemin ouvert » (Laurent, 11/09/2026 — lot C.2b-3).
 *
 * Exportée, et pas écrite au fil du JSX : le bloc « Signature » la teste et le
 * moteur la refuse en écho. Recopier la phrase, ce serait la voir diverger — et
 * les apostrophes typographiques de ce fichier en font un piège à test vert.
 */
export const AVERTISSEMENT_DEPOT_ANNULE_ENVOI =
  'Cette pièce est partie en signature électronique. Déposer un scan ici ANNULERA cet ' +
  'envoi chez le prestataire : le lien de signature cessera de fonctionner, même s’il a ' +
  'déjà été transmis, et la pièce sera régénérée sans ses zones de signature. Une pièce ' +
  'n’a qu’un seul chemin ouvert — le scan que vous déposez fera foi.';

/** Le libellé dit ce qu'il fait. Un « Confirmer » nu ne nomme pas l'annulation. */
export const LIBELLE_CONFIRMER_DEPOT = 'Annuler l’envoi et déposer le scan';

export interface UploadSignedDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  docType: string;
  /**
   * Vrai quand la pièce est PARTIE en signature électronique et n'est pas
   * encore signée. Seul le bloc « Signature » le sait (`etat === 'ENVOYE'`) ;
   * le menu de la matrice, lui, l'ignore — d'où le garde-fou serveur, qui
   * refuse tout dépôt non confirmé quel que soit le chemin d'entrée.
   */
  envoiEnAttente?: boolean;
}

export function UploadSignedDocDialog({ open, onOpenChange, participantId, docType, envoiEnAttente = false }: UploadSignedDocDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * L'utilisateur a lu l'avertissement et demandé le dépôt malgré tout.
   *
   * ⚠ C'EST LUI, ET NON `envoiEnAttente`, QUI POSE LE DRAPEAU envoyé au
   * serveur. Le drapeau signifie « l'utilisateur a confirmé », pas « une
   * demande existe ». Si l'étape de confirmation venait à disparaître, le
   * drapeau disparaîtrait avec elle et le serveur refuserait le dépôt : l'échec
   * serait visible, jamais silencieux.
   */
  const [confirmationDemandee, setConfirmationDemandee] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleFileChange(f: File | null) {
    setError(null);
    // Un autre fichier, une autre décision : la confirmation ne se reporte pas.
    setConfirmationDemandee(false);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== 'application/pdf') {
      setError('Format non supporté. Le fichier doit être un PDF.');
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('Fichier trop volumineux (max 10 Mo).');
      setFile(null);
      return;
    }
    setFile(f);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    // La confirmation vient AVANT toute requête : l'utilisateur doit lire ce
    // qui va se passer — l'annulation de l'envoi — et le valider.
    if (envoiEnAttente && !confirmationDemandee) {
      setConfirmationDemandee(true);
      return;
    }
    televerser(file);
  }

  function televerser(f: File) {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('participantId', participantId);
    fd.append('docType', docType);
    if (confirmationDemandee) fd.append('annulerEnvoiEnCours', '1');
    startTransition(async () => {
      const res = await uploadSignedDoc(fd);
      if (res.ok) {
        toast.success(
          confirmationDemandee ? 'PDF signé téléversé — envoi annulé' : 'PDF signé téléversé',
        );
        setFile(null);
        setError(null);
        setConfirmationDemandee(false);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur lors de l'opération. Réessayez ou contactez un administrateur.");
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="text-lg font-semibold">Téléverser le PDF signé</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Le PDF apparaîtra comme preuve de signature dans la matrice (pastille verte).
          </Dialog.Description>

          {/* L'avertissement est là DÈS L'OUVERTURE, avant même le choix du
              fichier : le découvrir après coup, c'est le découvrir trop tard.
              (Lot C.2b-3 — « une pièce, un seul chemin ouvert ».) */}
          {envoiEnAttente && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <Ban className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{AVERTISSEMENT_DEPOT_ANNULE_ENVOI}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="signed-pdf-file" className="block text-sm font-medium mb-1">
                Fichier PDF
              </label>
              <input
                id="signed-pdf-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                disabled={pending}
                className="block w-full text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
              />
              <p className="text-xs text-muted-foreground mt-1">Format PDF · max 10 Mo</p>
              {file && (
                <p className="text-sm text-muted-foreground mt-2">
                  {file.name} · {Math.round(file.size / 1024)} Ko
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="text-red-600 text-xs mt-2"
                >
                  {error}
                </p>
              )}
            </div>

            {/* L'ÉTAPE de confirmation, et non une case à cocher : une case se
                coche sans lire. Remplacer le bouton « Téléverser » par un
                bouton qui NOMME l'annulation oblige à passer par le texte. */}
            {confirmationDemandee ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-3">
                <p role="alert" className="text-sm text-red-800">
                  Confirmez-vous l’annulation de l’envoi en signature pour déposer ce scan ?
                  L’envoi sera annulé chez le prestataire avant l’enregistrement du scan ; si
                  l’annulation échoue, rien ne sera déposé.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmationDemandee(false)}
                    className="px-3 py-1.5 rounded-md border border-border bg-white hover:bg-muted text-sm disabled:opacity-50"
                  >
                    Revenir
                  </button>
                  <button
                    type="button"
                    disabled={!file || pending}
                    onClick={() => file && televerser(file)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
                      'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
                    )}
                  >
                    {pending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Téléversement…
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4" aria-hidden="true" />
                        {LIBELLE_CONFIRMER_DEPOT}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={pending}
                    className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={!file || pending}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
                    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                  )}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Téléversement…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Téléverser
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
