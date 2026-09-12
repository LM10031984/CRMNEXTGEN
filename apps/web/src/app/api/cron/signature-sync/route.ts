/**
 * Cron : le FILET des webhooks perdus (spec §5 lot C).
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://qualiof.vercel.app/api/cron/signature-sync
 *
 * POURQUOI IL EXISTE. Un webhook peut ne jamais arriver : une coupure réseau,
 * un déploiement en cours, une erreur 500 pendant la fenêtre de rejeu du
 * prestataire. Sans filet, la pièce reste GELÉE en `sent_for_signature` pour
 * toujours — signée chez le prestataire, jamais revenue ici, et la cellule reste
 * orange devant un admin qui n'a aucun moyen de savoir pourquoi.
 *
 * COMMENT IL S'Y PREND — ET CE QU'IL NE REFAIT PAS. Il re-interroge le
 * prestataire, puis passe par `traiterEvenementSignature`, LE MÊME chemin que le
 * webhook. Il ne réécrit pas la logique de retour : deux chemins pour « la
 * signature est revenue » divergeraient, et c'est le chemin qui télécharge le
 * PDF et le certificat.
 *
 * ⚠ ET IL UTILISE LA MÊME CLÉ D'IDEMPOTENCE que le webhook (`submission.completed`,
 * pas `sync:completed`). C'est voulu : si le webhook arrive en retard après que
 * le cron a fait le travail, il est DÉDUPLIQUÉ — sinon le PDF serait
 * re-téléchargé et l'exemplaire renvoyé une seconde fois.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { getSignatureProvider, SignatureNotConfiguredError } from '@/lib/signature/provider';
import { traiterEvenementSignature } from '@/server/signature-retour';
import type { SignatureEvent } from '@/lib/signature/port';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** On ne réveille que les demandes sans nouvelle depuis une heure. */
const SILENCE_MINIMUM_MS = 60 * 60 * 1000;

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse('Unauthorized', { status: 401 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let provider;
  try {
    provider = getSignatureProvider();
  } catch (e) {
    if (e instanceof SignatureNotConfiguredError) {
      return NextResponse.json({ ok: false, error: 'signature-non-configuree' }, { status: 503 });
    }
    throw e;
  }

  const now = new Date();
  const enAttente = await prisma.signatureRequest.findMany({
    where: {
      status: { in: ['SENT', 'PARTIALLY_SIGNED'] },
      sentAt: { not: null, lt: new Date(now.getTime() - SILENCE_MINIMUM_MS) },
    },
    select: { id: true, providerId: true, expiresAt: true },
  });

  let rattrapees = 0;
  let expirees = 0;
  let inchangees = 0;
  let erreurs = 0;

  for (const demande of enAttente) {
    // L'EXPIRATION SE DÉCIDE ICI, pas chez le prestataire : lui peut très bien
    // garder la demande ouverte au-delà de la date que NOUS avons posée.
    if (demande.expiresAt !== null && demande.expiresAt < now) {
      await traiterEvenementSignature({
        event: evenement('request.expired', demande.providerId, now),
        typeBrut: 'submission.expired',
        provider,
      });
      expirees++;
      continue;
    }

    let etat;
    try {
      etat = await provider.getRequest(demande.providerId);
    } catch (e) {
      console.error(
        `[signature-sync] état illisible pour ${demande.providerId} :`,
        e instanceof Error ? e.message : e,
      );
      erreurs++;
      continue;
    }

    if (etat.status === 'DONE') {
      await traiterEvenementSignature({
        event: evenement('request.completed', demande.providerId, etat.completedAt ?? now),
        typeBrut: 'submission.completed',
        provider,
      });
      rattrapees++;
      continue;
    }
    if (etat.status === 'DECLINED') {
      await traiterEvenementSignature({
        event: evenement('signer.declined', demande.providerId, now),
        typeBrut: 'form.declined',
        provider,
      });
      rattrapees++;
      continue;
    }
    inchangees++;
  }

  return NextResponse.json({
    ok: true,
    examinees: enAttente.length,
    rattrapees,
    expirees,
    inchangees,
    erreurs,
  });
}

/**
 * Un événement SYNTHÉTIQUE, de la même forme que celui d'un webhook.
 *
 * `signerId: null` : le cron ne sait pas QUI a refusé — seul le webhook le
 * porte. `demandeFermee` le gère (le refus n'est alors pas daté sur une ligne
 * précise, et la cause reste générique) plutôt que de désigner quelqu'un au
 * hasard.
 */
function evenement(
  type: SignatureEvent['type'],
  providerId: string,
  occurredAt: Date,
): SignatureEvent {
  return {
    type,
    providerId,
    signerId: null,
    signerEmail: null,
    auditTrailUrl: null,
    occurredAt,
    raw: { source: 'signature-sync' },
  };
}
