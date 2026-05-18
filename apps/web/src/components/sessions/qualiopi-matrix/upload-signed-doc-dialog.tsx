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
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { uploadSignedDoc } from '@/server/actions/qualiopi-matrix';

const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadSignedDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  docType: string;
}

export function UploadSignedDocDialog({ open, onOpenChange, participantId, docType }: UploadSignedDocDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleFileChange(f: File | null) {
    setError(null);
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
    const fd = new FormData();
    fd.append('file', file);
    fd.append('participantId', participantId);
    fd.append('docType', docType);
    startTransition(async () => {
      const res = await uploadSignedDoc(fd);
      if (res.ok) {
        toast.success('PDF signé téléversé');
        setFile(null);
        setError(null);
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
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
