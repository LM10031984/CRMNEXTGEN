'use client';

/**
 * Editor pour un OpcoSubmission status=DRAFT.
 *
 * Permet à Laurent de :
 * - vérifier/éditer destinataire, sujet, corps
 * - cocher/décocher les PJ avant envoi
 * - voir les pièces manquantes
 * - envoyer maintenant OU marquer comme déjà envoyé manuellement
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  ArrowLeft,
  Save,
  Paperclip,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  sendOpcoSubmission,
  updateOpcoSubmissionDraft,
  markOpcoSubmissionStatus,
  type SubmissionAttachment,
} from '@/server/actions/opco-submission';
import {
  LIBELLES_PIECE_DOSSIER,
  PIECES_DONT_LA_SIGNATURE_EST_EXIGEE,
  type KindPieceDossier,
} from '@/lib/opco/pieces-dossier';
import { vueDossierPret } from '@/lib/opco/etat-dossier';
import { aideDestinataireDossier } from '@/lib/opco/destinataire-dossier';

/**
 * Les libellés viennent du module du dossier — lot D. Cet écran en portait une
 * COPIE, et elle avait déjà divergé (« Formulaire AGEFICE PA » ici, « …
 * pré-rempli » dans le corps du mail) : le financeur lisait donc un nom, et
 * l'admin qui composait en lisait un autre.
 */
const KIND_LABELS = LIBELLES_PIECE_DOSSIER;

/** Les natures de pièce qui portent une mention de signature, et elles seules. */
const PORTE_UNE_MENTION = new Set<KindPieceDossier>(PIECES_DONT_LA_SIGNATURE_EST_EXIGEE);

/**
 * « Signée » / « Non signée », ou rien.
 *
 * Rien dans trois cas, et chacun a sa raison : la pièce ne se signe pas (RIB,
 * CNI, programme), la pièce EST la preuve (certificat de signature), ou le
 * brouillon date d'avant le lot D et ne porte pas l'information — auquel cas on
 * se tait plutôt que d'affirmer « non signée » sur une pièce qui l'est
 * peut-être.
 */
function mentionSignature(a: SubmissionAttachment) {
  if (!PORTE_UNE_MENTION.has(a.kind) || a.signe === undefined) return null;
  return a.signe ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-[10px] font-medium shrink-0">
      Signée
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-[10px] font-medium shrink-0">
      Non signée
    </span>
  );
}

interface Props {
  id: string;
  /**
   * Le RÔLE, décidé une fois côté serveur — jamais re-dérivé ici. C'est lui qui
   * décide si l'option « Envoyer quand même » existe, et `sendOpcoSubmission`
   * la refuse de toute façon à tout autre qu'un ADMIN : un bouton visible pour
   * un rôle refusé est un bouton qui ment.
   */
  role: string;
  initial: {
    recipientEmail: string | null;
    subject: string | null;
    bodyHtml: string | null;
    attachments: SubmissionAttachment[];
    apprenantName: string;
    sponsorName: string;
    sessionLabel: string;
    /**
     * Le financeur et la fiche du commanditaire — D-D-1. Ils décident de la
     * phrase affichée sous un champ destinataire vide : pour l'AGEFICE c'est le
     * point d'accueil qu'il faut rattacher, pas l'adresse de l'entreprise.
     */
    sponsorOpcoCode: string | null;
    sponsorOrgId: string;
  };
}

export function SubmissionEditor({ id, role, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recipient, setRecipient] = useState(initial.recipientEmail ?? '');
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml ?? '');
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>(initial.attachments);

  function toggleAttachment(idx: number) {
    setAttachments((arr) =>
      arr.map((a, i) => (i === idx ? { ...a, included: !a.included } : a)),
    );
  }

  function saveDraft() {
    startTransition(async () => {
      const r = await updateOpcoSubmissionDraft(id, {
        recipientEmail: recipient,
        subject,
        bodyHtml,
        attachments,
      });
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur sauvegarde');
        return;
      }
      toast.success('Brouillon sauvegardé');
      router.refresh();
    });
  }

  function send(force = false) {
    if (!recipient.trim()) {
      toast.error('Email destinataire vide');
      return;
    }
    if (!attachments.some((a) => a.included)) {
      toast.error('Aucune pièce jointe sélectionnée');
      return;
    }
    // La confirmation DIT ce qu'elle engage. « Envoyer quand même » sans
    // rappeler ce qui manque ferait cliquer sans relire.
    const question = force
      ? `${dossier.blocage ?? ''}\n\nEnvoyer tout de même ce dossier à ${recipient} ?`
      : `Envoyer ce dossier à ${recipient} ?`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      // Sauvegarde puis envoi
      const u = await updateOpcoSubmissionDraft(id, {
        recipientEmail: recipient,
        subject,
        bodyHtml,
        attachments,
      });
      if (!u.ok) {
        toast.error(u.error ?? 'Erreur sauvegarde');
        return;
      }
      // ⚠ `force` n'est JAMAIS passé par le chemin ordinaire — pas même
      // `{ force: false }` : le serveur ne doit pas avoir à distinguer « on n'a
      // pas demandé » de « on a demandé non ».
      const r = force ? await sendOpcoSubmission(id, { force: true }) : await sendOpcoSubmission(id);
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur envoi');
        return;
      }
      const dryRunNote = r.dryRun ? ' (mode test SMTP)' : '';
      toast.success(`Dossier envoyé à ${recipient}${dryRunNote}`);
      router.push('/app/dossiers-opco' as any);
    });
  }

  function markSent() {
    if (!window.confirm('Marquer comme déjà envoyé manuellement ?')) return;
    startTransition(async () => {
      const r = await markOpcoSubmissionStatus(id, 'SENT', 'Envoi manuel');
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur');
        return;
      }
      toast.success('Marqué comme envoyé');
      router.push('/app/dossiers-opco' as any);
    });
  }

  const includedCount = attachments.filter((a) => a.included).length;

  // ⚠ RIEN N'EST DÉCIDÉ ICI. `vueDossierPret` appelle `piecesNonSignees`, LA
  // MÊME fonction que `sendOpcoSubmission` : l'écran ne peut donc pas annoncer
  // « prêt » sur un dossier que le serveur refusera, ni l'inverse.
  const dossier = vueDossierPret({ attachments, destinataire: recipient, role });

  return (
    <div className="space-y-5">
      {/* Bandeau apprenant / sponsor */}
      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Dossier OPCO</div>
        <div className="text-base font-semibold">{initial.apprenantName}</div>
        <div className="text-xs text-muted-foreground">{initial.sessionLabel}</div>
        <div className="text-xs text-muted-foreground">→ {initial.sponsorName}</div>
      </div>

      {/* Email destinataire */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Email destinataire
        </label>
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="contact@agefice.fr"
          className="w-full px-3 py-2 border border-border rounded-md text-sm"
        />
        {/* ⚠ LA PHRASE EST COMPOSÉE PAR LE MODULE (D-D-1). Celle d'avant — « vérifie
            l'organisation sponsor (champ emailBilling) » — était périmée depuis
            le lot D (un dossier AGEFICE part au point d'accueil, pas au
            commanditaire) et nommait une COLONNE de base, que l'écran appelle
            « Email de facturation ». Écrite dans le JSX, elle n'était
            vérifiable qu'à l'œil, et c'est à l'œil qu'elle a survécu au lot qui
            la rendait fausse. */}
        {!recipient && (
          <p className="text-[10px] text-amber-700 mt-1 inline-flex items-center gap-1 flex-wrap">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {aideDestinataireDossier({
              opcoCode: initial.sponsorOpcoCode,
              organisation: initial.sponsorName,
            })}{' '}
            <a
              href={`/app/organisations/${initial.sponsorOrgId}`}
              className="font-semibold underline underline-offset-2 hover:text-amber-900"
            >
              Ouvrir la fiche organisation
            </a>
          </p>
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Sujet</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm"
        />
      </div>

      {/* Body HTML */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Corps du message (HTML)
        </label>
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          HTML simple — la liste des PJ se met à jour automatiquement à l'envoi.
        </p>
      </div>

      {/* ── L'ÉTAT DU DOSSIER, avant tout clic (lot D) ──────────────────────
          La phrase vient de `vueDossierPret`, jamais du JSX : écrite ici, elle
          ne serait vérifiable qu'à l'œil — et c'est précisément à l'œil qu'on a
          laissé partir des conventions vierges chez des financeurs. */}
      {dossier.blocage === null ? (
        <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Dossier prêt</strong> — toutes les pièces exigées sont signées.
          </span>
        </p>
      ) : (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{dossier.blocage}</span>
        </p>
      )}

      {/* Attachments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> Pièces jointes ({includedCount}/{attachments.length})
          </label>
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-amber-700 italic">
            Aucune pièce trouvée — génère d'abord la convention, le programme et le PDF AGEFICE depuis la fiche apprenant.
          </p>
        ) : (
          <ul className="rounded-lg border border-border divide-y divide-border">
            {attachments.map((a, idx) => (
              <li key={`${a.kind}-${idx}`} className="flex items-center gap-3 p-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={a.included}
                  onChange={() => toggleAttachment(idx)}
                  className="h-4 w-4 rounded border-border"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{KIND_LABELS[a.kind]}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">{a.filename}</div>
                </div>
                {/* ⚠ SEULES LES PIÈCES DONT LA SIGNATURE EST EXIGÉE portent la
                    mention. Le certificat de signature n'est ni « signé » ni
                    « non signé » — il EST la preuve ; la CNI et le RIB ne se
                    signent pas. Les marquer tous ferait chercher une signature
                    sur un RIB. Un `signe` inconnu (brouillon d'avant le lot D)
                    ne dit rien plutôt que de mentir. */}
                {mentionSignature(a)}
                {a.included ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => router.push('/app/dossiers-opco' as any)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border text-sm hover:bg-muted/40 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Sauvegarder brouillon
          </button>
          <button
            type="button"
            onClick={markSent}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5" /> Marquer envoyé manuellement
          </button>
          {/* ⚠ « Envoyer quand même » EXISTE ou n'existe pas — jamais grisé
              (discipline du bloc « Signature », décision Laurent n°3). Ici ce
              n'est pas un réglage qui manque, c'est un RÔLE : un bouton grisé
              ferait chercher une case à cocher qui n'existe pas. Et
              `sendOpcoSubmission` le refuserait de toute façon à tout autre
              qu'un ADMIN — un bouton visible pour un rôle refusé ment. */}
          {dossier.forcagePossible && (
            <button
              type="button"
              onClick={() => send(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Envoyer quand même
            </button>
          )}
          <button
            type="button"
            onClick={() => send()}
            disabled={pending || !dossier.envoiPossible}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Envoyer maintenant
          </button>
        </div>
      </div>
    </div>
  );
}
