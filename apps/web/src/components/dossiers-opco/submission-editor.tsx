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

const KIND_LABELS: Record<SubmissionAttachment['kind'], string> = {
  CNI: 'Carte d\'identité',
  RIB: 'RIB',
  CFP_ATTESTATION: 'Attestation CFP URSSAF',
  AGEFICE_PA_FORM: 'Formulaire AGEFICE PA',
  CONVENTION: 'Convention de formation',
  PROGRAMME: 'Programme pédagogique',
  OTHER: 'Autre',
};

interface Props {
  id: string;
  initial: {
    recipientEmail: string | null;
    subject: string | null;
    bodyHtml: string | null;
    attachments: SubmissionAttachment[];
    apprenantName: string;
    sponsorName: string;
    sessionLabel: string;
  };
}

export function SubmissionEditor({ id, initial }: Props) {
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

  function send() {
    if (!recipient.trim()) {
      toast.error('Email destinataire vide');
      return;
    }
    if (!attachments.some((a) => a.included)) {
      toast.error('Aucune pièce jointe sélectionnée');
      return;
    }
    if (!window.confirm(`Envoyer ce dossier à ${recipient} ?`)) return;
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
      const r = await sendOpcoSubmission(id);
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
        {!recipient && (
          <p className="text-[10px] text-amber-700 mt-1 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> À renseigner — vérifie l'organisation sponsor (champ emailBilling).
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
          <button
            type="button"
            onClick={send}
            disabled={pending || !recipient || includedCount === 0}
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
