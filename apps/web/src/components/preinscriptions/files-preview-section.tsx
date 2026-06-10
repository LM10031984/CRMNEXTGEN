'use client';

import { useState } from 'react';
import { CreditCard, Building2, FileText, Eye, Download, X } from 'lucide-react';

interface FileMeta {
  present: boolean;
  /** Extension fichier sans le point (ex: "pdf", "jpg"). null si absent. */
  ext: string | null;
}

interface FilesPreviewSectionProps {
  preEnrollmentId: string;
  cni: FileMeta;
  rib: FileMeta;
  cfp: FileMeta;
}

type Kind = 'cni' | 'rib' | 'cfp';

const KIND_META: Record<Kind, { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }> }> = {
  cni: { label: "Pièce d'identité", icon: CreditCard },
  rib: { label: 'RIB', icon: Building2 },
  cfp: { label: 'Attestation CFP', icon: FileText },
};

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export function FilesPreviewSection({ preEnrollmentId, cni, rib, cfp }: FilesPreviewSectionProps) {
  const [openKind, setOpenKind] = useState<Kind | null>(null);

  const files: Array<{ kind: Kind; meta: FileMeta }> = [
    { kind: 'cni', meta: cni },
    { kind: 'rib', meta: rib },
    { kind: 'cfp', meta: cfp },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {files.map(({ kind, meta }) => (
          <FileCard
            key={kind}
            kind={kind}
            meta={meta}
            preEnrollmentId={preEnrollmentId}
            onPreview={() => setOpenKind(kind)}
          />
        ))}
      </div>

      {openKind && (
        <PreviewModal
          preEnrollmentId={preEnrollmentId}
          kind={openKind}
          ext={files.find((f) => f.kind === openKind)!.meta.ext ?? ''}
          onClose={() => setOpenKind(null)}
        />
      )}
    </>
  );
}

function FileCard({
  kind,
  meta,
  preEnrollmentId,
  onPreview,
}: {
  kind: Kind;
  meta: FileMeta;
  preEnrollmentId: string;
  onPreview: () => void;
}) {
  const { label, icon: Icon } = KIND_META[kind];

  if (!meta.present) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 inline-flex items-center gap-2.5 text-xs text-slate-500">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shrink-0">
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0 truncate font-medium">{label}</span>
        <span className="italic text-slate-400">non fournie</span>
      </div>
    );
  }

  const downloadUrl = `/api/preinscriptions/${preEnrollmentId}/file/${kind}`;
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-4 flex items-center gap-2.5 text-sm group hover:ring-primary-200 hover:shadow-card-hover transition-all duration-200">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-50 to-primary-100 text-primary shrink-0 ring-1 ring-primary-100">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-900">{label}</span>
      <button
        type="button"
        onClick={onPreview}
        className="h-8 px-2.5 rounded-lg hover:bg-primary-50 text-slate-500 hover:text-primary inline-flex items-center gap-1 text-xs transition-colors"
        title="Aperçu"
        aria-label={`Aperçu ${label}`}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener"
        className="h-8 px-2.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 text-xs transition-colors"
        title="Télécharger"
        aria-label={`Télécharger ${label}`}
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function PreviewModal({
  preEnrollmentId,
  kind,
  ext,
  onClose,
}: {
  preEnrollmentId: string;
  kind: Kind;
  ext: string;
  onClose: () => void;
}) {
  const { label } = KIND_META[kind];
  const inlineUrl = `/api/preinscriptions/${preEnrollmentId}/file/${kind}?inline=1`;
  const downloadUrl = `/api/preinscriptions/${preEnrollmentId}/file/${kind}`;
  const isImage = IMAGE_EXTS.has(ext.toLowerCase());

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-elevated max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-transparent">
          <h3 className="font-semibold text-sm text-slate-900">{label}</h3>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gradient-to-br from-primary to-primary-700 text-white text-xs font-medium shadow-soft hover:shadow-card-hover hover:from-primary-600 hover:to-primary-800 active:scale-[0.98] transition-all duration-200"
            >
              <Download className="h-3.5 w-3.5" /> Télécharger
            </a>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center transition-all duration-200 active:scale-95"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-50 min-h-[60vh] flex items-center justify-center overflow-auto">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inlineUrl}
              alt={label}
              className="max-w-full max-h-[80vh] object-contain"
            />
          ) : (
            <iframe
              src={inlineUrl}
              title={label}
              className="w-full h-[80vh] border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
