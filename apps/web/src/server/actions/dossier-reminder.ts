'use server';

/**
 * Relance email 1-clic pour un dossier OPCO en attente (US-012).
 *
 * 3 types de relance selon l'état du dossier :
 *   - "a-facturer" : pas envoyée (Start Academy doit émettre la facture)
 *   - "attente-opco" : facture émise, en attente de remboursement OPCO
 *   - "attente-client" : facture émise, en attente de paiement client
 *
 * Destinataire : sponsor.emailBilling || sponsor.email. Si null → erreur.
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ReminderResult {
  ok: boolean;
  to?: string | null;
  reminderType?: 'attente-opco' | 'attente-client';
  dryRun?: boolean;
  error?: string;
}

export async function sendDossierReminderEmail(
  participantId: string,
): Promise<ReminderResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const p = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: { select: { firstName: true, lastName: true } },
      sponsorOrg: { select: { legalName: true, opcoCode: true, email: true, emailBilling: true } },
      session: {
        select: {
          id: true,
          code: true,
          startDate: true,
          endDate: true,
          product: { select: { title: true } },
        },
      },
    },
  });
  if (!p) return { ok: false, error: 'Inscription introuvable' };

  // Détermine le type de relance attendu
  if (!p.invoiceSent) {
    return { ok: false, error: 'Facture non encore émise — relance non applicable' };
  }
  let reminderType: 'attente-opco' | 'attente-client';
  if (!p.opcoReimbursed && p.sponsorOrg.opcoCode) {
    reminderType = 'attente-opco';
  } else if (!p.paymentReceived) {
    reminderType = 'attente-client';
  } else {
    return { ok: false, error: 'Dossier complet — pas de relance à envoyer' };
  }

  const recipient =
    p.sponsorOrg.emailBilling?.trim() || p.sponsorOrg.email?.trim() || null;
  if (!recipient) {
    return {
      ok: false,
      to: null,
      error: `Aucun email facturation pour ${p.sponsorOrg.legalName}. Renseigne emailBilling/email sur la fiche organisation.`,
    };
  }

  const of = await loadOfConfig(user.tenantId);
  const stagiaire = `${p.person.firstName} ${p.person.lastName}`.trim();
  const formationTitre = p.session.product.title;
  const sessionDates = `${dateFmt.format(p.session.startDate)} → ${dateFmt.format(p.session.endDate)}`;
  const montant = fmtEUR.format(Number(p.priceHT));

  const subject =
    reminderType === 'attente-opco'
      ? `Relance remboursement OPCO — ${stagiaire} (${p.session.code})`
      : `Relance paiement — ${stagiaire} (${p.session.code})`;

  const body =
    reminderType === 'attente-opco'
      ? `Nous vous relançons pour le remboursement du dossier de formation suivant. La facture vous a été transmise et nous restons en attente de votre validation et règlement.`
      : `Nous vous relançons pour le règlement de la facture du dossier de formation suivant. Le règlement reste en attente.`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0; padding:20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1F2937; background:#F1F5F9;">
  <div style="max-width:600px; margin:0 auto; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:#00527A; padding:20px 28px; color:white;">
      <strong style="font-size:14pt;">${escapeHtml(of.name)}</strong>
    </div>
    <div style="padding:24px 28px;">
      <p>Bonjour,</p>
      <p>${body}</p>

      <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:11pt;">
        <tr><td style="padding:6px 0; color:#64748B; width:40%;">Stagiaire :</td><td style="padding:6px 0;"><strong>${escapeHtml(stagiaire)}</strong></td></tr>
        <tr><td style="padding:6px 0; color:#64748B;">Formation :</td><td style="padding:6px 0;">${escapeHtml(formationTitre)}</td></tr>
        <tr><td style="padding:6px 0; color:#64748B;">Session :</td><td style="padding:6px 0;">${escapeHtml(p.session.code)} · ${escapeHtml(sessionDates)}</td></tr>
        <tr><td style="padding:6px 0; color:#64748B;">Montant HT :</td><td style="padding:6px 0;"><strong>${escapeHtml(montant)}</strong></td></tr>
      </table>

      <p>Pour toute question ou difficulté, n'hésitez pas à nous contacter.</p>
      <p style="margin-top:20px;">Cordialement,<br>L'équipe ${escapeHtml(of.name)}</p>
    </div>
    <div style="background:#F8FAFC; padding:14px 28px; border-top:1px solid #E2E8F0; font-size:9pt; color:#64748B;">
      <strong style="color:#00527A;">${escapeHtml(of.name)}</strong> — SIRET ${escapeHtml(of.siret)} — NDA ${escapeHtml(of.rnq)}
    </div>
  </div>
</body></html>`;

  const text = `Bonjour,\n\n${body}\n\nStagiaire : ${stagiaire}\nFormation : ${formationTitre}\nSession : ${p.session.code} (${sessionDates})\nMontant HT : ${montant}\n\nCordialement,\n${of.name}`;

  const r = await sendMail({
    to: recipient,
    subject,
    html,
    text,
    context: {
      tenantId: user.tenantId,
      category: 'opco_reminder',
      sessionId: p.session.id,
    },
  });
  if (!r.ok) return { ok: false, to: recipient, error: r.error };
  return { ok: true, to: recipient, reminderType, dryRun: r.dryRun };
}
