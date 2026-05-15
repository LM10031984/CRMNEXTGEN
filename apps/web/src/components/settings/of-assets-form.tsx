'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import { Image as ImageIcon, RotateCcw } from 'lucide-react';
import {
  uploadTenantLogo,
  uploadTenantSignature,
  resetTenantLogo,
  resetTenantSignature,
} from '@/server/actions/tenant-assets';

/**
 * Form Logo & signatures (Phase 7 Plan 07-04 — SET-02 assets).
 *
 * 3 zones upload :
 *  - Logo OF (PNG/JPG/SVG) → écrit /public/of-assets/{tenantId}/logo.png
 *  - Signature responsable pédagogique → signature-pedago.png
 *  - Signature dirigeant → signature-dirigeant.png
 *
 * Comportement par asset :
 *  - Thumbnail courant avec cache-busting `?v=Date.now()` (Pitfall 2 RESEARCH.md
 *    — sinon le navigateur garde l'ancienne image en cache après upload).
 *  - Bouton "Remplacer" (input file caché + label styled).
 *  - Bouton "Restaurer par défaut" → AlertDialog confirmation → reset.
 *
 * Server actions consommées (Plan 07-03) :
 *  - uploadTenantLogo(formData) / uploadTenantSignature(role, formData)
 *  - resetTenantLogo() / resetTenantSignature(role)
 */

interface OfAssetsFormProps {
  initial: {
    logoPath: string | null;
    signaturePedagoPath: string | null;
    signatureDirigeantPath: string | null;
  };
  /** Onsaved/onCancel ne sont pas utilisés pour les uploads (pas de mode
   *  édition global — chaque upload est autonome) mais on respecte le contrat
   *  `SettingsSection.editView`. Le bouton "Fermer" appelle onCancel. */
  onSaved: () => void;
  onCancel: () => void;
}

// Fallback paths pour les assets bundled (cf. CONTEXT.md D-04/D-05).
const DEFAULT_LOGO = '/of-assets/defaults/logo-start-academy.png';
const DEFAULT_SIGNATURE_PEDAGO = '/of-assets/defaults/signature-laurent.png';
const DEFAULT_SIGNATURE_DIRIGEANT = '/of-assets/defaults/tampon-signature.png';

type AssetKind = 'logo' | 'signature-pedago' | 'signature-dirigeant';

export function OfAssetsForm({ initial, onCancel }: OfAssetsFormProps) {
  // Bump pour forcer le rechargement des thumbnails après upload/reset
  // (cache-busting Pitfall 2 RESEARCH.md).
  const [version, setVersion] = useState(() => Date.now());
  const bumpVersion = () => setVersion(Date.now());

  const [confirmReset, setConfirmReset] = useState<AssetKind | null>(null);

  const logoSrc = (initial.logoPath || DEFAULT_LOGO) + `?v=${version}`;
  const sigPedagoSrc =
    (initial.signaturePedagoPath || DEFAULT_SIGNATURE_PEDAGO) + `?v=${version}`;
  const sigDirigeantSrc =
    (initial.signatureDirigeantPath || DEFAULT_SIGNATURE_DIRIGEANT) +
    `?v=${version}`;

  return (
    <>
      <div className="space-y-6">
        <AssetRow
          kind="logo"
          label="Logo OF"
          accept="image/png,image/jpeg,image/svg+xml"
          currentSrc={logoSrc}
          isDefault={!initial.logoPath}
          onUploaded={bumpVersion}
          onAskReset={() => setConfirmReset('logo')}
        />

        <AssetRow
          kind="signature-pedago"
          label="Signature responsable pédagogique"
          accept="image/png,image/jpeg"
          currentSrc={sigPedagoSrc}
          isDefault={!initial.signaturePedagoPath}
          onUploaded={bumpVersion}
          onAskReset={() => setConfirmReset('signature-pedago')}
        />

        <AssetRow
          kind="signature-dirigeant"
          label="Signature dirigeant"
          accept="image/png,image/jpeg"
          currentSrc={sigDirigeantSrc}
          isDefault={!initial.signatureDirigeantPath}
          onUploaded={bumpVersion}
          onAskReset={() => setConfirmReset('signature-dirigeant')}
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>

      <Dialog.Root
        open={confirmReset !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmReset(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
            <Dialog.Title className="text-lg font-semibold">
              Restaurer l'image par défaut
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Cette action supprimera l'image actuellement uploadée et restaurera
              le fichier par défaut bundled avec l'application. Continuer ?
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <ResetButton
                kind={confirmReset}
                onDone={() => {
                  setConfirmReset(null);
                  bumpVersion();
                }}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function AssetRow({
  kind,
  label,
  accept,
  currentSrc,
  isDefault,
  onUploaded,
  onAskReset,
}: {
  kind: AssetKind;
  label: string;
  accept: string;
  currentSrc: string;
  isDefault: boolean;
  onUploaded: () => void;
  onAskReset: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const inputId = `asset-${kind}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      const result =
        kind === 'logo'
          ? await uploadTenantLogo(fd)
          : await uploadTenantSignature(
              kind === 'signature-pedago' ? 'pedago' : 'dirigeant',
              fd,
            );
      if (result.ok) {
        toast.success(`${label} mis à jour`);
        onUploaded();
      } else {
        toast.error(result.error);
      }
      // Reset l'input pour permettre de re-uploader le même fichier.
      e.target.value = '';
    });
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative w-32 h-20 rounded-md border border-border bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
        <ImageIcon
          className="h-6 w-6 text-muted-foreground"
          aria-hidden="true"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentSrc}
          alt={label}
          className="absolute inset-0 w-full h-full object-contain bg-white"
          onError={(e) => {
            // Si l'asset n'existe pas (premier rendu pré-Plan 07-03), masquer
            // l'image et laisser apparaître le placeholder ImageIcon en dessous.
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {isDefault
            ? 'Image par défaut (bundled)'
            : 'Image personnalisée uploadée'}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <label
          htmlFor={inputId}
          className={
            isPending
              ? 'h-9 px-3 rounded-md border border-input bg-muted text-xs font-medium cursor-not-allowed opacity-50 inline-flex items-center'
              : 'h-9 px-3 rounded-md border border-input bg-white text-xs font-medium hover:bg-muted transition-colors cursor-pointer inline-flex items-center'
          }
        >
          {isPending ? 'Upload…' : 'Remplacer'}
        </label>
        <input
          id={inputId}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          disabled={isPending}
          className="hidden"
        />
        {!isDefault && (
          <button
            type="button"
            onClick={onAskReset}
            disabled={isPending}
            className="h-9 px-3 rounded-md border border-input bg-white text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 inline-flex items-center gap-1"
            title="Restaurer par défaut"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Restaurer</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ResetButton({
  kind,
  onDone,
}: {
  kind: AssetKind | null;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (!kind) return;
    startTransition(async () => {
      const result =
        kind === 'logo'
          ? await resetTenantLogo()
          : await resetTenantSignature(
              kind === 'signature-pedago' ? 'pedago' : 'dirigeant',
            );
      if (result.ok) {
        toast.success('Image par défaut restaurée');
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
    >
      {isPending ? 'Restauration…' : 'Restaurer'}
    </button>
  );
}
