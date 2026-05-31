'use client';

import { useState } from 'react';
import { PenTool, ShieldCheck, Copy, Check, Clock, Globe, Monitor } from 'lucide-react';

interface SignatureProofPanelProps {
  preEnrollmentId: string;
  signatureHash: string;
  signatureSignedAt: Date;
  signatureIp: string | null;
  signatureUserAgent: string | null;
}

/**
 * Panneau de preuve de signature électronique simple (eIDAS niveau "simple").
 *
 * Affiche :
 *  - Preview de la signature PNG via /api/preinscriptions/[id]/file/signature?inline=1
 *  - Hash SHA-256 du PNG (preuve d'intégrité — toute altération invalide le hash)
 *  - Horodatage de signature
 *  - IP source au moment de la signature
 *  - User-Agent (navigateur)
 *
 * Cette combinaison constitue un faisceau de preuves recevable pour les
 * conventions Qualiopi, CGV, attestations de pré-inscription.
 */
export function SignatureProofPanel({
  preEnrollmentId,
  signatureHash,
  signatureSignedAt,
  signatureIp,
  signatureUserAgent,
}: SignatureProofPanelProps) {
  const [copied, setCopied] = useState(false);
  const sigUrl = `/api/preinscriptions/${preEnrollmentId}/file/signature?inline=1`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(signatureHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const fmtSigned = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(signatureSignedAt);

  return (
    <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
          <PenTool className="h-4 w-4" /> Signature électronique
        </h2>
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
          <ShieldCheck className="h-3 w-3" /> Signée &amp; horodatée
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Preview signature */}
        <div className="rounded-lg border border-border bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sigUrl}
            alt="Signature de l'apprenant"
            className="w-full h-auto max-h-60 object-contain"
          />
        </div>

        {/* Métadonnées de preuve */}
        <dl className="space-y-2.5 text-sm">
          <ProofRow icon={Clock} label="Signée le">
            <span className="font-medium">{fmtSigned}</span>
          </ProofRow>
          {signatureIp && (
            <ProofRow icon={Globe} label="Adresse IP">
              <span className="font-mono text-xs">{signatureIp}</span>
            </ProofRow>
          )}
          {signatureUserAgent && (
            <ProofRow icon={Monitor} label="Navigateur">
              <span className="text-xs text-muted-foreground break-words">
                {signatureUserAgent}
              </span>
            </ProofRow>
          )}
          <ProofRow icon={ShieldCheck} label="Hash SHA-256">
            <div className="flex items-center gap-2">
              <code className="text-[10px] font-mono bg-muted px-2 py-1 rounded break-all flex-1 min-w-0">
                {signatureHash.slice(0, 16)}…{signatureHash.slice(-16)}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center shrink-0"
                title="Copier le hash complet"
                aria-label="Copier le hash complet"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </ProofRow>
        </dl>
      </div>

      <p className="text-[11px] text-muted-foreground italic border-t border-border pt-3">
        Signature électronique de niveau "simple" (eIDAS). La preuve combine
        signature graphique + horodatage + IP + hash cryptographique. Recevable
        pour les CGV, conventions de formation et attestations. Pour les
        documents engageant juridiquement de gros montants, préférer une
        signature qualifiée (YouSign / Universign).
      </p>
    </section>
  );
}

function ProofRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
          {label}
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
