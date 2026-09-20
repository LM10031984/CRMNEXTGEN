'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mail, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import type { AfterTrainingDeliveryPreview } from '@/lib/post-formation/delivery';
import {
  recoverUncertainAfterTrainingDelivery,
  sendAfterTrainingDelivery,
} from '@/server/actions/after-training-delivery';

export function AfterTrainingDeliveryClient(props: {
  sessionId: string;
  sessionEnded: boolean;
  deliveries: AfterTrainingDeliveryPreview[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (!props.sessionEnded) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Les envois de fin de formation seront disponibles après la date de fin de session.
      </div>
    );
  }
  if (props.deliveries.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun destinataire actif pour cette session.</p>;
  }

  function send(delivery: AfterTrainingDeliveryPreview) {
    setSelectedKey(delivery.key);
    startTransition(async () => {
      const result = await sendAfterTrainingDelivery({
        sessionId: props.sessionId,
        deliveryKey: delivery.key,
        fingerprint: delivery.fingerprint,
      });
      setSelectedKey(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Envoi impossible');
        return;
      }
      toast.success(`Documents envoyés à ${delivery.recipientEmail}`);
      router.refresh();
    });
  }

  function recover(delivery: AfterTrainingDeliveryPreview, resolution: 'retry' | 'sent') {
    const question = resolution === 'sent'
      ? 'Confirmez-vous avoir retrouvé ce message dans la boîte Envoyés de formation@start-academy.fr ? Il sera marqué envoyé sans nouvel envoi SMTP.'
      : 'Confirmez-vous avoir vérifié que ce message n’est pas dans la boîte Envoyés de formation@start-academy.fr ? Une nouvelle tentative sera autorisée.';
    if (!window.confirm(question)) return;
    setSelectedKey(delivery.key);
    startTransition(async () => {
      const result = await recoverUncertainAfterTrainingDelivery({
        sessionId: props.sessionId,
        deliveryKey: delivery.key,
        resolution,
      });
      setSelectedKey(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Reprise impossible');
        return;
      }
      toast.success(resolution === 'sent' ? 'Envoi confirmé depuis la boîte Envoyés' : 'Nouvelle tentative autorisée');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {props.deliveries.map((delivery) => {
        const blocked = delivery.blockers.length > 0 || !delivery.recipientEmail;
        const busy = pending && selectedKey === delivery.key;
        return (
          <section key={delivery.key} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{delivery.title}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {delivery.kind === 'individual' ? 'Apprenant indépendant' : 'Entreprise'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  À : {delivery.recipientName}
                  {delivery.recipientEmail ? ` <${delivery.recipientEmail}>` : ' — adresse manquante'}
                </p>
              </div>
              {delivery.state === 'sent' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Envoyé{delivery.sentAt ? ` le ${new Date(delivery.sentAt).toLocaleDateString('fr-FR')}` : ''}
                </span>
              ) : delivery.state === 'uncertain' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" /> État SMTP incertain — reprise bloquée
                </span>
              ) : null}
            </div>

            {delivery.blockers.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-medium">Envoi bloqué</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {delivery.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            )}

            {delivery.changedSinceLastSend && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Pièces, destinataire ou membres mis à jour depuis le dernier envoi
                {delivery.previousSentAt ? ` du ${new Date(delivery.previousSentAt).toLocaleDateString('fr-FR')}` : ''}.
                Contrôlez le nouvel aperçu avant d’envoyer cette version.
              </div>
            )}

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aperçu de l’email</p>
                <p className="mt-2 text-sm font-medium">Objet : {delivery.subject}</p>
                <div className="mt-2 text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: delivery.html }} />
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Paperclip className="h-3.5 w-3.5" /> Pièces jointes ({delivery.attachments.length})
                </p>
                <ul className="mt-2 space-y-2">
                  {delivery.attachments.map((attachment) => (
                    <li key={`${attachment.kind}:${attachment.id}`}>
                      <a href={attachment.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                        {attachment.label} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={blocked || pending || delivery.state !== 'ready'}
                onClick={() => send(delivery)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Confirmer et envoyer
              </button>
              {delivery.state === 'uncertain' && delivery.canRecover && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => recover(delivery, 'retry')}
                  className="ml-2 inline-flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Non parti — autoriser une nouvelle tentative
                </button>
              )}
              {delivery.state === 'uncertain' && delivery.canRecover && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => recover(delivery, 'sent')}
                  className="ml-2 inline-flex h-9 items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 text-sm font-medium text-emerald-900 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Retrouvé dans Envoyés — confirmer envoyé
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
