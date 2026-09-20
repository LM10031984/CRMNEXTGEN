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

import { UploadPieceButton } from './upload-piece-button';
import { controlCompanyPieces } from '@/lib/opco/company-dossier';
import { useEffect, useState, useTransition } from 'react';
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
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  sendOpcoSubmission,
  selectOpcoPointAccueil,
  confirmOpcoCfpPostalCode,
  resolveOpcoDelivery,
  updateOpcoSubmissionDraft,
  markOpcoSubmissionStatus,
  refreshOpcoSubmissionDraft,
  type SubmissionAttachment,
} from '@/server/actions/opco-submission';
import {
  LIBELLES_PIECE_DOSSIER,
  PIECES_DONT_LA_SIGNATURE_EST_EXIGEE,
  type KindPieceDossier,
} from '@/lib/opco/pieces-dossier';
import { vueDossierPret } from '@/lib/opco/etat-dossier';
import { aideDestinataireDossier } from '@/lib/opco/destinataire-dossier';
import { controlePiecesAgefice, PIECES_AGEFICE, type DossierStage } from '@/lib/opco/agefice-envoi';

/**
 * Les libellés viennent du module du dossier — lot D. Cet écran en portait une
 * COPIE, et elle avait déjà divergé (« Formulaire AGEFICE PA » ici, « …
 * pré-rempli » dans le corps du mail) : le financeur lisait donc un nom, et
 * l'admin qui composait en lisait un autre.
 */
const KIND_LABELS = LIBELLES_PIECE_DOSSIER;

/** Les natures de pièce qui portent une mention de signature, et elles seules. */
const PORTE_UNE_MENTION = new Set<KindPieceDossier>([
  ...PIECES_DONT_LA_SIGNATURE_EST_EXIGEE,
  'EMARGEMENT',
  'ASSIDUITE',
]);

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
    agefice?: boolean;
    company?: boolean;
    sessionId?: string;
    stage?: DossierStage;
    deliveryState?: 'READY' | 'SENDING' | 'UNCERTAIN';
    lastError?: string | null;
    pointAccueilOptions?: Array<{ id: string; name: string; email: string | null }>;
    pointAccueilId?: string | null;
    department?: string | null;
  };
}

export function SubmissionEditor({ id, role, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recipient, setRecipient] = useState(initial.recipientEmail ?? '');
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml ?? '');
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>(initial.attachments);
  const [pointAccueilId, setPointAccueilId] = useState(initial.pointAccueilId ?? '');
  const [cfpPostalCode, setCfpPostalCode] = useState('');
  const [editingPostalCode, setEditingPostalCode] = useState(false);
  useEffect(() => setAttachments(initial.attachments), [initial.attachments]);
  // Only a changed server value replaces local edits, never an unrelated refresh.
  useEffect(() => setRecipient(initial.recipientEmail ?? ''), [initial.recipientEmail]);
  useEffect(() => setPointAccueilId(initial.pointAccueilId ?? ''), [initial.pointAccueilId]);

  function attachPointAccueil() {
    if (pending || locked || !pointAccueilId) return;
    startTransition(async () => {
      const result = await selectOpcoPointAccueil(id, pointAccueilId);
      if (!result.ok) {
        toast.error(result.error ?? 'Impossible de rattacher ce point d’accueil');
        return;
      }
      toast.success('Point d’accueil rattaché au dossier');
      router.refresh();
    });
  }

  function confirmPostalCode() {
    if (pending || locked || !/^\d{5}$/.test(cfpPostalCode)) return;
    startTransition(async () => {
      const result = await confirmOpcoCfpPostalCode(id, cfpPostalCode);
      if (!result.ok) {
        toast.error(result.error ?? 'Impossible de confirmer ce code postal');
        return;
      }
      toast.success('Code postal vérifié sur l’attestation CFP enregistré');
      setEditingPostalCode(false);
      router.refresh();
    });
  }

  function refreshAttachments() {
    startTransition(async () => {
      const result = await refreshOpcoSubmissionDraft(id);
      if (!result.ok) {
        toast.error(result.error ?? 'Impossible d’actualiser les pièces');
        return;
      }
      toast.success('Pièces du dossier actualisées');
      router.refresh();
    });
  }

  function toggleAttachment(idx: number) {
    setAttachments((arr) => arr.map((a, i) => (i === idx ? { ...a, included: !a.included } : a)));
  }

  function reconcile(resolution: 'SENT' | 'RETRY') {
    if (
      !window.confirm(
        resolution === 'SENT'
          ? 'Après vérification de la messagerie, confirmez-vous que ce dossier est bien parti ?'
          : 'Après vérification de la messagerie, confirmez-vous que ce dossier n’est pas parti et peut être renvoyé ?',
      )
    )
      return;
    startTransition(async () => {
      const result = await resolveOpcoDelivery(id, resolution);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        resolution === 'SENT'
          ? 'Envoi confirmé après vérification'
          : 'Brouillon disponible pour un nouvel envoi',
      );
      router.refresh();
    });
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
    if (locked || ((strictAgefice || initial.company) && blocage)) return;
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
      const r = force
        ? await sendOpcoSubmission(id, { force: true })
        : await sendOpcoSubmission(id);
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur envoi');
        router.refresh();
        return;
      }
      if (r.dryRun) {
        toast.info(
          'Aucun email envoyé : simulation ou envoi désactivé. Le dossier reste en brouillon.',
        );
        router.refresh();
        return;
      }
      toast.success(`Dossier envoyé à ${recipient}`);
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
  const strictAgefice = initial.agefice ?? initial.sponsorOpcoCode === 'AGEFICE';
  const stage = initial.stage ?? 'PRISE_EN_CHARGE';
  const locked = initial.deliveryState === 'SENDING' || initial.deliveryState === 'UNCERTAIN';
  const blocage = locked
    ? initial.deliveryState === 'UNCERTAIN'
      ? 'Le résultat du dernier envoi est incertain. Vérifiez son départ avant toute nouvelle tentative.'
      : 'Un envoi est en cours. Actualisez la page pour consulter son résultat.'
    : !recipient.trim()
      ? dossier.blocage
      : strictAgefice
        ? controlePiecesAgefice(attachments, stage)
        : initial.company
          ? controlCompanyPieces(attachments)
          : dossier.blocage;

  const required: readonly KindPieceDossier[] = strictAgefice
    ? PIECES_AGEFICE[stage]
    : initial.company
      ? ['CONVENTION', 'PROGRAMME']
      : [];
  const readyCount = required.filter((kind) =>
    attachments.some(
      (a) =>
        a.kind === kind &&
        a.included &&
        a.key?.trim() &&
        (!PORTE_UNE_MENTION.has(kind) || a.signe === true),
    ),
  ).length;
  return (
    <div className="space-y-5">
      {/* Bandeau apprenant / sponsor */}
      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {stage === 'FIN_FORMATION' ? 'Fin de formation' : 'Demande de prise en charge'}
        </div>
        <div className="text-base font-semibold">{initial.apprenantName}</div>
        <div className="text-xs text-muted-foreground">{initial.sessionLabel}</div>
        <div className="text-xs text-muted-foreground">→ {initial.sponsorName}</div>
      </div>
      {initial.lastError && (
        <p role="status" className="text-sm text-amber-800">
          {initial.lastError}
        </p>
      )}

      {strictAgefice && stage !== 'FIN_FORMATION' && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <label htmlFor="agefice-point-accueil" className="block text-sm font-medium">
            Point d’accueil AGEFICE
          </label>
          <p className="text-xs text-muted-foreground">
            {initial.department
              ? `Département de l’entreprise vérifié sur la CFP : ${initial.department}. Choisissez le point d’accueil qui traite ce dossier.`
              : 'Renseignez ici le code postal de l’entreprise vérifié sur l’attestation CFP pour retrouver les points d’accueil.'}
          </p>
          {initial.department && (
            <p className="text-xs text-muted-foreground">
              {initial.pointAccueilOptions?.length ?? 0} points proposés pour le département{' '}
              {initial.department}. Cette liste est filtrée ; elle ne représente pas tout l’annuaire
              national.
            </p>
          )}
          {initial.department && !editingPostalCode && (
            <button
              type="button"
              onClick={() => setEditingPostalCode(true)}
              disabled={pending || locked}
              className="text-xs underline"
            >
              Modifier le code postal CFP
            </button>
          )}
          {(!initial.department || editingPostalCode) && (
            <div className="space-y-2">
              <label htmlFor="agefice-cfp-postal-code" className="block text-xs font-medium">
                Code postal de l’entreprise sur l’attestation CFP
              </label>
              <input
                id="agefice-cfp-postal-code"
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                value={cfpPostalCode}
                onChange={(event) => setCfpPostalCode(event.target.value)}
                disabled={pending || locked}
                placeholder="Ex. 06000"
                className="w-full px-3 py-2 border border-border rounded-md text-sm disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                En confirmant, vous attestez avoir vérifié ce code postal sur l’attestation CFP de
                cet apprenant.
              </p>
              <button
                type="button"
                onClick={confirmPostalCode}
                disabled={pending || locked || !/^\d{5}$/.test(cfpPostalCode)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm disabled:opacity-50"
              >
                Confirmer ce code postal
              </button>
            </div>
          )}
          <select
            id="agefice-point-accueil"
            value={pointAccueilId}
            onChange={(event) => setPointAccueilId(event.target.value)}
            disabled={pending || locked}
            className="w-full px-3 py-2 border border-border rounded-md text-sm disabled:opacity-50"
          >
            <option value="">Choisir un point d’accueil</option>
            {(initial.pointAccueilOptions ?? []).map((point) => (
              <option key={point.id} value={point.id} disabled={!point.email}>
                {point.name} — {point.email ?? 'Adresse email manquante'}
              </option>
            ))}
          </select>
          {initial.department && !initial.pointAccueilOptions?.length && (
            <p className="text-xs text-amber-700">
              Aucun point d’accueil trouvé dans le référentiel pour ce département. Vérifiez la
              fiche organisation.
            </p>
          )}
          <button
            type="button"
            onClick={attachPointAccueil}
            disabled={
              pending ||
              locked ||
              !pointAccueilId ||
              !initial.pointAccueilOptions?.some(
                (point) => point.id === pointAccueilId && point.email,
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Rattacher ce point d’accueil
          </button>
        </div>
      )}

      {/* Email destinataire */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Email destinataire
        </label>
        <input
          type="email"
          value={recipient}
          readOnly={initial.agefice && stage === 'FIN_FORMATION'}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="contact@agefice.fr"
          className="w-full px-3 py-2 border border-border rounded-md text-sm"
        />
        {initial.agefice && stage === 'FIN_FORMATION' && (
          <p className="text-xs text-muted-foreground mt-1">
            Même destinataire que la demande initiale confirmée.
            {!recipient && ' Vérifiez d’abord le dépôt initial.'}
          </p>
        )}
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
        <iframe
          title="Aperçu du mail avant envoi"
          srcDoc={bodyHtml}
          sandbox=""
          referrerPolicy="no-referrer"
          className="w-full min-h-48 rounded border bg-white mb-3"
        />
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Relisez le message et les pièces sélectionnées avant l’envoi. Le texte du message reste
          celui affiché ici.
        </p>
      </div>

      {/* ── L'ÉTAT DU DOSSIER, avant tout clic (lot D) ──────────────────────
          La phrase vient de `vueDossierPret`, jamais du JSX : écrite ici, elle
          ne serait vérifiable qu'à l'œil — et c'est précisément à l'œil qu'on a
          laissé partir des conventions vierges chez des financeurs. */}
      {blocage === null ? (
        <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Dossier prêt</strong> — les pièces obligatoires sont présentes et les signatures
            requises sont renseignées.
          </span>
        </p>
      ) : (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{blocage}</span>
        </p>
      )}

      {required.length > 0 && (
        <section className="rounded-lg border p-3 space-y-3" aria-label="Pièces requises">
          <p className="text-sm font-semibold">
            Dossier : {readyCount}/{required.length} pièces prêtes
          </p>
          <ul className="space-y-2">
            {required.map((kind) => {
              const piece = attachments.find((a) => a.kind === kind && a.key?.trim());
              const state = !piece
                ? 'Manquante'
                : PORTE_UNE_MENTION.has(kind) && piece.signe !== true
                  ? 'Signature manquante'
                  : !piece.included
                    ? 'Non sélectionnée'
                    : 'Prête';
              return (
                <li key={kind} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {KIND_LABELS[kind]}{' '}
                    <span className={state === 'Prête' ? 'text-emerald-700' : 'text-amber-700'}>
                      — {state}
                    </span>
                  </span>
                  {['CNI', 'RIB', 'CFP_ATTESTATION'].includes(kind) && (
                    <UploadPieceButton
                      submissionId={id}
                      kind={kind}
                      label={KIND_LABELS[kind]}
                      present={!!piece}
                      disabled={pending || locked}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {strictAgefice && (
            <p className="text-xs text-muted-foreground">
              PDF, JPG ou PNG · 3 Mo maximum. CNI et RIB sont enregistrés sur la fiche apprenant ;
              la CFP sur son dossier AGEFICE. Les pièces jointes sont actualisées après le dépôt.
            </p>
          )}
          {initial.sessionId && (
            <a
              href={`/app/sessions/${initial.sessionId}#depot-pieces-signees`}
              className="text-xs underline underline-offset-2"
            >
              Déposer une convention ou une autre pièce signée
            </a>
          )}
        </section>
      )}
      {/* Attachments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> Fichiers sélectionnés ({includedCount}/
            {attachments.length})
          </label>
          <button
            type="button"
            onClick={refreshAttachments}
            disabled={pending || locked}
            className="inline-flex items-center gap-1.5 text-xs underline underline-offset-2 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualiser les pièces
          </button>
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-amber-700 italic">
            Aucune pièce trouvée — génère d'abord la convention, le programme et le PDF AGEFICE
            depuis la fiche apprenant.
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
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {a.filename}
                  </div>
                </div>
                {/* ⚠ SEULES LES PIÈCES DONT LA SIGNATURE EST EXIGÉE portent la
                    mention. Le certificat de signature n'est ni « signé » ni
                    « non signé » — il EST la preuve ; la CNI et le RIB ne se
                    signent pas. Les marquer tous ferait chercher une signature
                    sur un RIB. Un `signe` inconnu (brouillon d'avant le lot D)
                    ne dit rien plutôt que de mentir. */}
                <a
                  href={`/api/dossiers-opco/${id}/pieces?kind=${encodeURIComponent(a.kind)}&filename=${encodeURIComponent(a.filename)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-xs"
                >
                  Consulter
                </a>
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

      {locked && ['ADMIN', 'MANAGER'].includes(role) && (
        <div className="rounded-lg border border-amber-300 p-3 text-sm space-y-2">
          <p>
            Vérifiez la messagerie avant toute reprise. Ces actions sont disponibles dix minutes
            après la tentative.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => reconcile('SENT')}
              className="underline"
            >
              Confirmer que le mail est parti
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => reconcile('RETRY')}
              className="underline"
            >
              Confirmer l’absence d’envoi et réessayer
            </button>
          </div>
        </div>
      )}

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
            disabled={pending || locked}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border text-sm hover:bg-muted/40 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Sauvegarder brouillon
          </button>
          {!strictAgefice && !initial.company && (
            <button
              type="button"
              onClick={markSent}
              disabled={pending || locked}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
            >
              <Mail className="h-3.5 w-3.5" /> Marquer envoyé manuellement
            </button>
          )}
          {/* ⚠ « Envoyer quand même » EXISTE ou n'existe pas — jamais grisé
              (discipline du bloc « Signature », décision Laurent n°3). Ici ce
              n'est pas un réglage qui manque, c'est un RÔLE : un bouton grisé
              ferait chercher une case à cocher qui n'existe pas. Et
              `sendOpcoSubmission` le refuserait de toute façon à tout autre
              qu'un ADMIN — un bouton visible pour un rôle refusé ment. */}
          {!strictAgefice && !initial.company && dossier.forcagePossible && (
            <button
              type="button"
              onClick={() => send(true)}
              disabled={pending || locked}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Envoyer quand même
            </button>
          )}
          <button
            type="button"
            onClick={() => send()}
            disabled={pending || blocage !== null}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Envoyer maintenant
          </button>
        </div>
      </div>
    </div>
  );
}
