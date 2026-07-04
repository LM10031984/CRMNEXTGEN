'use client';

/**
 * Composant partagé d'upload DIRECT-TO-STORAGE (Phase 18 STOR-03, côté client).
 *
 * Réutilisé par le formulaire public /p/[token] ET l'écran admin (D-08). Le
 * navigateur envoie le `File` BRUT directement vers Supabase via un signed
 * upload URL (aucun octet ne transite par une server action → pas de 413 /
 * Pitfall 2 sur photo smartphone 10 Mo).
 *
 * Flux :
 *   1. `requestUploadUrl(kind, ext)` (injectée, diffère public vs admin) → signed URL + token.
 *   2. XHR PUT du File sur l'URL signée avec progression réelle (D-06, xhr.upload.onprogress).
 *   3. Succès → `onUploaded(kind, path)` remonte la clé au parent (qui confirmera au serveur).
 *
 * D-05 : limite 50 Mo (remplace 10). D-07 : 1 retry auto silencieux + bouton « Réessayer »
 * (les autres champs du formulaire ne sont JAMAIS touchés — ce composant gère UNIQUEMENT son
 * propre fichier). PII : aperçu image via <img> natif (JAMAIS le composant image
 * optimisé de Next — proxy CDN interdit sur PII, CLAUDE.md).
 */

import { useRef, useState } from 'react';
import { Check, X, Loader2, Upload, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Limite d'upload (D-05, remplace l'ancienne limite 10 Mo). */
const MAX_FILE_SIZE_MB = 50;

export type DirectUploadKind = 'CNI' | 'RIB' | 'CFP';

type SignedUploadResult =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; error: string };

export interface DirectUploadFieldProps {
  kind: DirectUploadKind;
  label: string;
  description: string;
  required?: boolean;
  /** Icône lucide (comme les slots de public-form). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Génère le signed URL — diffère public (peToken) vs admin (session). */
  requestUploadUrl: (kind: DirectUploadKind, ext: string) => Promise<SignedUploadResult>;
  /** Remonte la clé confirmée au parent (qui appellera la confirmation serveur). */
  onUploaded: (kind: DirectUploadKind, path: string) => void;
  /** Le fichier a été retiré → le parent oublie la clé. */
  onCleared: (kind: DirectUploadKind) => void;
}

type Status = 'idle' | 'uploading' | 'done' | 'error';

/**
 * Résout l'URL PUT-able absolue. `createSignedUploadUrl` de Supabase renvoie un
 * `signedUrl` RELATIF (ex: `/object/upload/sign/bucket/key?token=...`). Pour un
 * XHR PUT direct, on préfixe l'origine publique + `/storage/v1`. Si l'URL est
 * déjà absolue (autre provider / SDK futur), on la renvoie telle quelle.
 */
function resolveSignedPutUrl(signedUrl: string): string {
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error(
      "Configuration manquante (NEXT_PUBLIC_SUPABASE_URL) — contacte l'administrateur.",
    );
  }
  const path = signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`;
  return `${base.replace(/\/$/, '')}/storage/v1${path}`;
}

/**
 * XHR PUT direct sur l'URL signée avec progression réelle (D-06). Resolve à la
 * fin de l'upload. `x-upsert` reprend l'option `{ upsert: true }` du serveur.
 * (RESEARCH Code Example lignes 300-311.)
 */
function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const putUrl = resolveSignedPutUrl(signedUrl);
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', putUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
    xhr.send(file);
  });
}

export function DirectUploadField({
  kind,
  label,
  description,
  required,
  icon: Icon = Upload,
  requestUploadUrl,
  onUploaded,
  onCleared,
}: DirectUploadFieldProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `direct-upload-${kind}`;

  /** Un seul essai complet (signed URL → PUT direct). Throw en cas d'échec. */
  async function runOnce(f: File): Promise<void> {
    const ext = f.name.split('.').pop() ?? 'bin';
    const r = await requestUploadUrl(kind, ext);
    if (!r.ok) throw new Error(r.error);
    await uploadWithProgress(r.signedUrl, f, setProgress);
    onUploaded(kind, r.path);
  }

  /**
   * Tente l'upload. D-07 : 1 retry auto SILENCIEUX ; si le 2ᵉ échoue → status
   * error + message FR + bouton « Réessayer » (rappelle attemptUpload). Les
   * autres champs du formulaire ne sont pas touchés.
   */
  async function attemptUpload(f: File) {
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setStatus('error');
      setErrorMsg(`Le fichier dépasse ${MAX_FILE_SIZE_MB} Mo`);
      return;
    }
    setStatus('uploading');
    setProgress(0);
    setErrorMsg(null);
    try {
      await runOnce(f);
      setStatus('done');
    } catch (firstErr) {
      // Retry auto silencieux (1 fois).
      try {
        setProgress(0);
        await runOnce(f);
        setStatus('done');
      } catch (secondErr: any) {
        console.error('Upload direct échoué (après 1 retry)', firstErr, secondErr);
        setStatus('error');
        setErrorMsg(
          secondErr?.message
            ? `Échec de l'envoi : ${secondErr.message}. Réessaie sans perdre tes autres champs.`
            : "Échec de l'envoi du fichier. Réessaie sans perdre tes autres champs.",
        );
      }
    }
  }

  function handleSelect(f: File | null) {
    // Nettoie l'ancien aperçu blob.
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (!f) {
      setFile(null);
      setStatus('idle');
      setProgress(0);
      setErrorMsg(null);
      onCleared(kind);
      return;
    }
    setFile(f);
    if (f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f));
    }
    void attemptUpload(f);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    handleSelect(null);
  }

  const borderClass =
    status === 'done'
      ? 'border-emerald-300 bg-emerald-50/50'
      : status === 'error'
        ? 'border-red-300 bg-red-50/40'
        : 'border-border hover:border-primary-300 hover:bg-muted/30';

  return (
    <div
      className={cn(
        'flex flex-col gap-2 p-4 rounded-lg border-2 border-dashed transition-colors',
        borderClass,
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'h-10 w-10 rounded-lg inline-flex items-center justify-center shrink-0',
            status === 'done'
              ? 'bg-emerald-100 text-emerald-700'
              : status === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {status === 'uploading' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : status === 'done' ? (
            <Check className="h-5 w-5" />
          ) : status === 'error' ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {label} {required && <span className="text-red-500">*</span>}
          </div>
          {file ? (
            <div
              className={cn(
                'text-xs truncate',
                status === 'error' ? 'text-red-700' : 'text-emerald-700',
              )}
            >
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} Mo)
              {status === 'uploading' && ` — ${progress}%`}
              {status === 'done' && ' — envoyé'}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>

        {file ? (
          <button
            type="button"
            onClick={clear}
            className="h-7 w-7 rounded-md hover:bg-red-50 text-red-600 inline-flex items-center justify-center shrink-0"
            title="Retirer"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <label
            htmlFor={inputId}
            className="text-xs text-primary font-medium shrink-0 cursor-pointer"
          >
            Choisir
          </label>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {/* Barre de progression réelle (D-06) pendant l'upload. */}
      {status === 'uploading' && (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Aperçu image PII : <img> natif, JAMAIS le composant image optimisé Next (CLAUDE.md). */}
      {previewUrl && status !== 'error' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={`Aperçu ${label}`}
          className="max-h-32 w-auto rounded-md border border-border object-contain"
        />
      )}

      {/* Erreur + bouton Réessayer (D-07), visible seulement en status error. */}
      {status === 'error' && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-red-700 inline-flex items-center gap-1.5 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
          {file && (
            <button
              type="button"
              onClick={() => void attemptUpload(file)}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
