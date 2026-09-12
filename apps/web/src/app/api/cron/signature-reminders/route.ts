/**
 * Cron : relances J+3 et J+7 aux signataires qui n'ont pas encore signé (D-5).
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://qualiof.vercel.app/api/cron/signature-reminders
 *
 * ⚠ LE COMPTEUR N'EST CONSOMMÉ QUE SUR UN DÉPART RÉEL. Un envoi en dry-run, ou
 * supprimé par les réglages tenant, ne doit PAS « brûler » une relance : sinon
 * un parc en mode test épuiserait ses deux rappels sans qu'un seul email soit
 * parti, et le jour où la catégorie serait cochée, plus personne ne serait
 * relancé. C'est le Pitfall 1 de la Phase 22, déjà appliqué aux deux crons
 * voisins.
 *
 * ⚠ ON RELANCE CELUI DONT C'EST LE TOUR, pas « le client ». Avec
 * `signatoryOrder = BEFORE` c'est l'organisme qui traîne, et lui envoyer le
 * rappel est exactement ce qu'il faut.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { parseSignatureSigners } from '@qualiof/shared';
import { loadOfConfig } from '@/lib/of-config';
import { resoudreSignataireOf } from '@/lib/signature/signataire-of';
import { notifierRelance } from '@/lib/signature/notifier';
import { NOM_DE_PIECE } from '@/lib/mailer-templates/signature-email-commun';
import { roleAncreOf } from '@/lib/signature/envoi-contrats';
import type { SignataireEnvoye } from '@/lib/signature/envoi-contrats';
import { prochainAPrevenir } from '@/lib/signature/retour';
import { estPieceSignable } from '@/server/signature-relacher';
import type { RangRelance } from '@/lib/mailer-templates/signature-relance';

export const dynamic = 'force-dynamic';

/** Première relance : la demande dort depuis 3 jours. */
const PREMIERE_RELANCE_JOURS = 3;
/** Seconde : 4 jours après la première, soit J+7 depuis l'envoi. */
const ENTRE_RELANCES_JOURS = 4;
/** Deux rappels, puis plus rien. Au-delà, c'est un appel téléphonique. */
const RELANCES_MAX = 2;

function joursEntre(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse('Unauthorized', { status: 401 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.signatureRequest.findMany({
    where: {
      status: { in: ['SENT', 'PARTIALLY_SIGNED'] },
      sentAt: { not: null },
      reminderCount: { lt: RELANCES_MAX },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      tenantId: true,
      sessionId: true,
      signers: true,
      sentAt: true,
      expiresAt: true,
      signerRole: true,
      reminderCount: true,
      lastReminderSentAt: true,
      session: { select: { code: true, product: { select: { title: true } } } },
      documents: {
        select: { id: true, type: true, entityType: true, entityId: true, participantId: true },
      },
    },
  });

  // Une lecture d'`OfConfig` par TENANT, pas par demande : une session de huit
  // dossiers ferait sinon huit lectures identiques.
  const ofParTenant = new Map<string, Awaited<ReturnType<typeof loadOfConfig>>>();
  const signataireOfParTenant = new Map<string, string | null>();

  let envoyees = 0;
  let ignorees = 0;
  let sansDepart = 0;

  for (const demande of candidates) {
    const sentAt = demande.sentAt;
    const doc = demande.documents[0];
    if (sentAt === null || doc === undefined || !estPieceSignable(doc.type)) {
      ignorees++;
      continue;
    }

    const depuisEnvoi = joursEntre(now, sentAt);
    if (depuisEnvoi < PREMIERE_RELANCE_JOURS) {
      ignorees++;
      continue;
    }
    if (
      demande.lastReminderSentAt !== null &&
      joursEntre(now, demande.lastReminderSentAt) < ENTRE_RELANCES_JOURS
    ) {
      ignorees++;
      continue;
    }

    const signers = parseSignatureSigners(demande.signers);
    const suivant = prochainAPrevenir(signers);
    if (suivant === null) {
      ignorees++;
      continue;
    }

    if (!ofParTenant.has(demande.tenantId)) {
      ofParTenant.set(demande.tenantId, await loadOfConfig(demande.tenantId));
      const resolu = await resoudreSignataireOf(demande.tenantId);
      signataireOfParTenant.set(demande.tenantId, resolu.ok ? resolu.signatory.name : null);
    }

    const roleOf = roleAncreOf(doc.type);
    const destinataire: SignataireEnvoye = {
      partie: roleOf !== null && suivant.role === roleOf ? 'OF' : 'CLIENT',
      role: suivant.role,
      nom: suivant.name,
      email: suivant.email,
      signUrl: suivant.signUrl,
      signedAt: suivant.signedAt,
    };

    const rang = (demande.reminderCount + 1) as RangRelance;
    const resultat = await notifierRelance({
      tenantId: demande.tenantId,
      sessionId: demande.sessionId,
      signatureRequestId: demande.id,
      documentId: doc.id,
      libellePiece: `${NOM_DE_PIECE[doc.type].titre} — ${demande.session.code}`,
      piece: doc.type,
      concerne: demande.session.code,
      organisation: null,
      formationTitre: demande.session.product.title,
      sessionCode: demande.session.code,
      dateLimite: demande.expiresAt ?? now,
      role: demande.signerRole ?? 'DIRIGEANT',
      signataires: [destinataire],
      of: ofParTenant.get(demande.tenantId)!,
      signataireOfNom: signataireOfParTenant.get(demande.tenantId) ?? null,
      rang,
      envoyeeLe: sentAt,
    });

    // ⚠ ICI, ET NULLE PART AILLEURS : le compteur ne bouge que si l'email est
    // VRAIMENT parti.
    if (!resultat.envoye) {
      sansDepart++;
      continue;
    }
    await prisma.signatureRequest.update({
      where: { id: demande.id },
      data: { reminderCount: { increment: 1 }, lastReminderSentAt: now },
    });
    envoyees++;
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, envoyees, ignorees, sansDepart });
}
