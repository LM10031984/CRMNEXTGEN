'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileSignature,
  HelpCircle,
  Link2,
  Loader2,
  Mail,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlink,
} from 'lucide-react';

import {
  approveProposalDiscount,
  generateProposalPdf,
  generateProposalQuotes,
  issueProposalPublicLink,
  markProposalReviewed,
  markProposalSent,
  revokeProposalPublicLink,
  sendProposalByEmail,
} from '@/server/actions/propositions';
import type { FingerprintComparison } from '@/lib/proposition/fingerprint';

/**
 * La barre d'actions de la proposition — et surtout ses portes.
 *
 * Le principe : ce qui bloque l'envoi est écrit en clair AVANT le bouton, pas
 * découvert après un clic refusé. Trois portes, dans l'ordre où elles se
 * lèvent : la relecture humaine, la validation d'une remise au-delà du seuil,
 * et un PDF à jour.
 */
export function ProposalActions({
  proposalId,
  status,
  reviewedAt,
  blockers,
  warnings,
  freshness,
  hasPdf,
  documentId,
  quoteNumbers,
  publicLinkActive,
  publicLinkExpiresAt,
  needsDiscountApproval,
  canApproveDiscount,
  discountApproved,
}: {
  proposalId: string;
  status: string;
  reviewedAt: string | null;
  blockers: string[];
  warnings: string[];
  freshness: FingerprintComparison;
  hasPdf: boolean;
  documentId: string | null;
  quoteNumbers: string[];
  publicLinkActive: boolean;
  publicLinkExpiresAt: string | null;
  needsDiscountApproval: boolean;
  canApproveDiscount: boolean;
  discountApproved: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Action impossible');
      }
    });
  };

  const editable = status === 'BROUILLON' || status === 'PRETE';

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      {freshness === 'stale' && hasPdf && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Le diagnostic ou le chiffrage a changé depuis la génération du PDF : le document ne
            correspond plus à ce qui est saisi. Régénérez-le avant de le remettre.
          </span>
        </div>
      )}

      {freshness === 'unknown' && hasPdf && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Ce PDF a été produit sans empreinte de contrôle : impossible de vérifier s’il
            correspond encore aux données. Le régénérer lèvera le doute.
          </span>
        </div>
      )}

      {blockers.length > 0 && status !== 'ENVOYEE' && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-1 font-semibold">Ce qui reste à faire avant de remettre ce document</p>
          <ul className="list-disc space-y-1 pl-4">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed">
          <p className="mb-1 font-semibold">À regarder avant de remettre le document</p>
          <ul className="list-disc space-y-1 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {needsDiscountApproval && !discountApproved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs dark:border-sky-800 dark:bg-sky-950/40">
          <span>
            Cette remise dépasse le seuil : elle attend la validation d’un responsable.
            {!canApproveDiscount && ' Votre rôle ne permet pas de l’accorder.'}
          </span>
          {canApproveDiscount && (
            <button
              type="button"
              onClick={() => run(() => approveProposalDiscount(proposalId), 'Remise validée')}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-400 bg-background px-2.5 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Valider la remise
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button
            type="button"
            onClick={() =>
              run(() => markProposalReviewed(proposalId), 'Proposition marquée comme relue')
            }
            disabled={pending || Boolean(reviewedAt)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            title={
              reviewedAt
                ? 'Déjà relue — toute modification du contenu ou du prix remet ce marqueur à zéro.'
                : undefined
            }
          >
            <Check className="h-4 w-4" />
            {reviewedAt ? 'Relue' : 'Marquer comme relue'}
          </button>
        )}

        <button
          type="button"
          onClick={() => run(() => generateProposalPdf(proposalId), 'PDF généré')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasPdf ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <FileSignature className="h-4 w-4" />
          )}
          {hasPdf ? 'Régénérer le PDF' : 'Générer le PDF'}
        </button>

        {hasPdf && documentId && (
          <a
            href={`/api/documents/${documentId}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted ${
              freshness === 'stale'
                ? 'border-amber-300 text-amber-800 dark:text-amber-300'
                : 'border-border'
            }`}
          >
            <Download className="h-4 w-4" />
            {freshness === 'stale' ? 'Ouvrir la version périmée' : 'Ouvrir le PDF'}
          </a>
        )}

        <button
          type="button"
          onClick={() =>
            start(async () => {
              const r = await generateProposalQuotes(proposalId);
              if (r.ok) {
                toast.success(`Devis générés : ${r.data?.numbers.join(', ')}`);
                router.refresh();
              } else {
                toast.error(r.error);
              }
            })
          }
          disabled={pending || quoteNumbers.length > 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          title={
            quoteNumbers.length > 0
              ? `Déjà générés : ${quoteNumbers.join(', ')}`
              : 'Un devis par payeur, aux montants exacts de la proposition.'
          }
        >
          <Receipt className="h-4 w-4" />
          {quoteNumbers.length > 0 ? `Devis : ${quoteNumbers.join(', ')}` : 'Générer les devis'}
        </button>

        {publicLinkActive ? (
          <button
            type="button"
            onClick={() => {
              setIssuedToken(null);
              run(() => revokeProposalPublicLink(proposalId), 'Lien public révoqué');
            }}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Unlink className="h-4 w-4" />
            Révoquer le lien
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              start(async () => {
                const r = await issueProposalPublicLink(proposalId);
                if (r.ok && r.data) {
                  setIssuedToken(r.data.token);
                  toast.success('Lien créé — il ne sera plus jamais réaffiché');
                  router.refresh();
                } else if (!r.ok) {
                  toast.error(r.error);
                }
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            Créer le lien de lecture
          </button>
        )}

        {status !== 'ENVOYEE' && status !== 'ACCEPTEE' && (
          <button
            type="button"
            onClick={() => run(() => markProposalSent(proposalId), 'Proposition marquée remise')}
            disabled={pending || blockers.length > 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            title={blockers[0]}
          >
            <Send className="h-4 w-4" />
            Marquer comme remise
          </button>
        )}

        {/* D-21 — l'envoi par email, déclenché ici et nulle part ailleurs. Il
            reste proposé même après ENVOYEE : une proposition remise en main
            propre se renvoie parfois par écrit, et le refuser obligerait à
            passer par sa propre boîte mail, hors de toute trace. */}
        {status !== 'ACCEPTEE' && (
          <button
            type="button"
            onClick={() =>
              start(async () => {
                const r = await sendProposalByEmail(proposalId);
                if (r.ok) {
                  toast.success(`Proposition envoyée à ${r.data?.sentTo ?? 'ce client'}.`);
                  router.refresh();
                } else {
                  // Une catégorie décochée ou un dry-run remontent ici : le
                  // commercial doit savoir que rien n'est parti, plutôt que de
                  // croire son client servi.
                  toast.error(r.error ?? 'Envoi impossible', { duration: 8000 });
                }
              })
            }
            disabled={pending || blockers.length > 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            title={blockers[0] ?? 'Envoie le lien de lecture au prospect'}
          >
            <Mail className="h-4 w-4" />
            Envoyer par email
          </button>
        )}
      </div>

      {issuedToken && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="mb-1 font-semibold">
            Le lien, affiché une seule fois — copiez-le maintenant.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-[11px]">
              {`${window.location.origin}/proposition/${issuedToken}`}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/proposition/${issuedToken}`,
                );
                toast.success('Lien copié');
              }}
              className="inline-flex items-center gap-1 rounded border border-emerald-400 bg-background px-2 py-1 hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
              Copier
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Seule son empreinte est conservée : nous ne pourrons pas vous le réafficher.
          </p>
        </div>
      )}

      {publicLinkActive && !issuedToken && (
        <p className="text-xs text-muted-foreground">
          Un lien de lecture est actif
          {publicLinkExpiresAt
            ? ` jusqu’au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(publicLinkExpiresAt))}`
            : ''}
          . Son contenu n’a pas été conservé en clair — révoquez-le et créez-en un nouveau si vous
          l’avez perdu.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        L’envoi par email n’est pas branché : le mailer est gelé jusqu’au 10/09/2026. Transmettez
        le PDF ou le lien par votre canal, puis marquez la proposition comme remise.
      </p>
    </section>
  );
}
