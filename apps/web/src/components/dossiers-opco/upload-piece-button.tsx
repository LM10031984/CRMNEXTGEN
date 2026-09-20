'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadOpcoPiece } from '@/server/actions/opco-upload-piece';

export function UploadPieceButton({
  submissionId,
  kind,
  label,
  disabled,
  present,
}: {
  submissionId: string;
  kind: string;
  label: string;
  disabled: boolean;
  present: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        aria-label={`Fichier ${label}`}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = '';
          if (file.size > 3 * 1024 * 1024) {
            toast.error('Fichier trop volumineux : 3 Mo maximum.');
            return;
          }
          setBusy(true);
          try {
            const data = new FormData();
            data.set('submissionId', submissionId);
            data.set('kind', kind);
            data.set('file', file);
            const result = await uploadOpcoPiece(data);
            if (result.ok) {
              toast.success(`${label} enregistrée et ajoutée au dossier`);
              router.refresh();
            } else {
              toast.error(result.error ?? 'Dépôt impossible');
              router.refresh();
            }
          } catch {
            toast.error('Dépôt interrompu. Actualisez les pièces avant de réessayer.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className="text-xs underline underline-offset-2 disabled:opacity-50"
        aria-label={`${present ? 'Remplacer' : 'Ajouter'} ${label}`}
      >
        {busy ? 'Enregistrement…' : present ? 'Remplacer' : 'Ajouter'}
      </button>
    </>
  );
}
