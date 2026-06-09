'use client';

import { useRef, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  AlertTriangle,
  FileText,
  IdCard,
  CreditCard,
  Receipt,
  Eye,
  Upload,
  RotateCw,
  Loader2,
  X,
} from 'lucide-react';
import { updateLearnerDocument, type LearnerDocKind } from '@/server/actions/update-learner-document';

interface Props {
  personId: string;
  cniKey: string | null | undefined;
  ribKey: string | null | undefined;
  cfpKey: string | null | undefined;
}

interface ChipDef {
  kind: LearnerDocKind;
  label: string;
  icon: typeof IdCard;
  key: string | null | undefined;
}

export function IdentityDocsCard({ personId, cniKey, ribKey, cfpKey }: Props) {
  const chips: ChipDef[] = [
    { kind: 'cni', label: "Pièce d'identité", icon: IdCard, key: cniKey },
    { kind: 'rib', label: 'RIB', icon: CreditCard, key: ribKey },
    { kind: 'cfp', label: 'Attestation URSSAF / CFP', icon: Receipt, key: cfpKey },
  ];

  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Documents d'identité & bancaires
        </h2>
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-1 gap-2">
        {chips.map((c) => (
          <DocRow key={c.kind} personId={personId} chip={c} />
        ))}
      </div>
    </section>
  );
}

function DocRow({ personId, chip }: { personId: string; chip: ChipDef }) {
  const Icon = chip.icon;
  const present = !!chip.key;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState(false);
  const router = useRouter();

  const docUrl = `/api/apprenants/${personId}/docs/${chip.kind}`;

  function onPickFile(file: File) {
    const fd = new FormData();
    fd.append('personId', personId);
    fd.append('kind', chip.kind);
    fd.append('file', file);
    startTransition(async () => {
      const r = await updateLearnerDocument(fd);
      if (!r.ok) {
        toast.error(r.error ?? 'Upload échoué');
        return;
      }
      toast.success(`${chip.label} mise à jour`);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
        present
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {chip.label}
        {present ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal opacity-80">
            <Check className="h-3 w-3" /> Présent
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-normal opacity-80">
            <AlertTriangle className="h-3 w-3" /> Manquant
          </span>
        )}
      </span>

      <div className="inline-flex items-center gap-1.5">
        {present && (
          <Dialog.Root open={preview} onOpenChange={setPreview}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-current/30 bg-white/60 px-2 py-1 text-xs font-medium hover:bg-white"
                disabled={pending}
              >
                <Eye className="h-3.5 w-3.5" /> Aperçu
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-5xl h-[88vh] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <Dialog.Title className="text-sm font-semibold inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" /> {chip.label}
                  </Dialog.Title>
                  <div className="flex items-center gap-2">
                    <a
                      href={docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Ouvrir / Télécharger
                    </a>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Fermer"
                        className="rounded-md p-1 hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>
                <iframe src={docUrl} className="flex-1 w-full bg-muted" title={chip.label} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-current/30 bg-white/60 px-2 py-1 text-xs font-medium hover:bg-white disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : present ? (
            <RotateCw className="h-3.5 w-3.5" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {present ? 'Remplacer' : 'Téléverser'}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
