/**
 * Phase 22 Plan 22-09 — RENVOI d'invitation (liens du 04/08 expirés le 11/08).
 *
 * Réplique EXACTE du flux `resendInvitation` de
 * `src/server/actions/tenant-users.ts` (Phase 8) : nouvelle `UserInvitation`
 * (token 32 hex frais, expiration J+7) liée au User EXISTANT — aucun nouveau
 * User, aucune modification du compte. Même template, même `sendMail`
 * catégorisé `user_invitation`, même AuditLog `users.invitation.resend`.
 * (Le wrapper server-action est inapplicable en script : `requireRole` lit
 * les cookies Next.)
 *
 * GARDE-FOUS identiques à `_invite-team.ts` (fail-loud) :
 *   garde 22-11 ouvert (emailsEnabled + userInvitationsEnabled), URL prod,
 *   SMTP non dry-run, User cible existant et actif.
 *
 * Le DRY relève AUSSI l'état des connexions (`lastLoginAt` + AuthSession)
 * des 3 invités du 04/08 — détection d'une première connexion tierce déjà
 * survenue.
 *
 * Usage (depuis apps/web) :
 *   RESEND_EMAIL=... pnpm exec dotenv -e ../../.env -- tsx scripts/_resend-invitation.ts        # DRY
 *   RESEND_EMAIL=... WRITE=1 NEXT_PUBLIC_APP_URL=https://qualiof.vercel.app \
 *     pnpm exec dotenv -e ../../.env -- tsx scripts/_resend-invitation.ts                        # WRITE
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { sendMail } from '../src/lib/mailer';
import { renderInvitationEmail } from '../src/lib/mailer-templates/user-invitation';
import { loadOfConfig } from '../src/lib/of-config';
import { logUserAction } from '../src/lib/audit-log';

const WRITE = process.env.WRITE === '1';
const PROD_URL = 'https://qualiof.vercel.app';
const INVITATION_VALIDITY_DAYS = 7; // identique tenant-users.ts:47
const RESEND_EMAIL = process.env.RESEND_EMAIL ?? '';

/** Invités du 04/08 — pour le relevé de connexions. */
const INVITED_EMAILS = [
  'formation@start-academy.fr',
  'jean-guy@start-academy.fr',
  'laurent@start-academy.fr',
];

function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}
function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_VALIDITY_DAYS * 86400 * 1000);
}
function maskEmail(email: string): string {
  return email.replace(/^(.)[^@]*(@.+)$/, '$1***$2');
}

async function main() {
  console.log(`=== _resend-invitation — mode ${WRITE ? 'WRITE (envoi réel)' : 'DRY (lecture seule)'} ===`);
  if (!RESEND_EMAIL) {
    console.error('FAIL: RESEND_EMAIL requis.');
    process.exit(2);
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length !== 1) {
    console.error(`FAIL: ${tenants.length} tenants (attendu 1).`);
    process.exit(2);
  }
  const tenant = tenants[0]!;

  // ── Garde-fou 22-11 ──────────────────────────────────────────────────
  const settings = await prisma.tenantEmailSettings.findUnique({ where: { tenantId: tenant.id } });
  console.log('TenantEmailSettings:', settings
    ? {
        emailsEnabled: settings.emailsEnabled,
        userInvitationsEnabled: settings.userInvitationsEnabled,
        invoiceRemindersEnabled: settings.invoiceRemindersEnabled,
        updatedAt: settings.updatedAt.toISOString(),
      }
    : 'ABSENT (fail-closed)');
  const settingsOk = settings?.emailsEnabled === true && settings?.userInvitationsEnabled === true;
  if (!settingsOk) {
    console.error('GARDE FERMÉ: emailsEnabled=true ET userInvitationsEnabled=true requis — STOP (aucun envoi).');
    process.exit(3);
  }

  // ── Relevé connexions des invités du 04/08 ───────────────────────────
  console.log('\nÉtat des connexions des invités du 04/08:');
  const invited = await prisma.user.findMany({
    where: { email: { in: INVITED_EMAILS } },
    select: { id: true, email: true, role: true, lastLoginAt: true, _count: { select: { authSessions: true } } },
    orderBy: { email: 'asc' },
  });
  for (const u of invited) {
    console.log(`  ${maskEmail(u.email)} role=${u.role} lastLogin=${u.lastLoginAt?.toISOString() ?? 'jamais'} authSessions=${u._count.authSessions}`);
  }

  // ── Cible du renvoi ──────────────────────────────────────────────────
  const target = await prisma.user.findFirst({
    where: { email: RESEND_EMAIL, tenantId: tenant.id },
    select: { id: true, email: true, firstName: true, role: true, disabledAt: true },
  });
  if (!target) {
    console.error(`FAIL: User introuvable pour ${maskEmail(RESEND_EMAIL)} — le renvoi exige un compte existant.`);
    process.exit(4);
  }
  if (target.disabledAt) {
    console.error('FAIL: User désactivé.');
    process.exit(4);
  }
  const previousInvitations = await prisma.userInvitation.findMany({
    where: { userId: target.id },
    select: { id: true, expiresAt: true, usedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nCible: ${target.firstName} <${maskEmail(target.email)}> role=${target.role}`);
  for (const inv of previousInvitations) {
    console.log(`  invitation ${inv.id} créée=${inv.createdAt.toISOString()} expire=${inv.expiresAt.toISOString()} used=${inv.usedAt?.toISOString() ?? 'non'}`);
  }

  // ── Env d'envoi ──────────────────────────────────────────────────────
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const mailDryRun = process.env.MAIL_DRY_RUN === 'true' || !process.env.SMTP_HOST;
  console.log(`\nNEXT_PUBLIC_APP_URL=${base} | SMTP_HOST=${process.env.SMTP_HOST ? 'SET' : 'ABSENT'} | dry-run env=${mailDryRun}`);
  if (WRITE && base !== PROD_URL) {
    console.error(`FAIL: NEXT_PUBLIC_APP_URL doit être ${PROD_URL} en WRITE.`);
    process.exit(5);
  }
  if (WRITE && mailDryRun) {
    console.error('FAIL: couche env en dry-run.');
    process.exit(5);
  }

  if (!WRITE) {
    console.log('\nDRY terminé — 1 renvoi partirait en WRITE=1. Aucune écriture.');
    await prisma.$disconnect();
    return;
  }

  // ── WRITE : flux resendInvitation répliqué à l'identique ─────────────
  // Acteur = admin e2e (même acteur que les invitations du 04/08).
  const actor = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: 'e2e@start-academy.fr', role: 'ADMIN', disabledAt: null },
    select: { id: true, email: true },
  });
  if (!actor) {
    console.error('FAIL: acteur ADMIN e2e introuvable.');
    process.exit(6);
  }

  const token = generateToken();
  const expiresAt = invitationExpiry();
  const invitation = await prisma.userInvitation.create({
    data: {
      tenantId: tenant.id,
      email: target.email,
      token,
      role: target.role,
      expiresAt,
      userId: target.id,
      invitedBy: actor.id,
    },
  });

  const of = await loadOfConfig(tenant.id);
  const { subject, html, text } = renderInvitationEmail(
    {
      firstName: target.firstName,
      publicUrl: `${base.replace(/\/$/, '')}/invitation/${token}`,
      expiresAt,
      invitedByName: 'Laurent Marx',
    },
    of,
  );
  const mailResult = await sendMail({
    to: target.email,
    subject,
    html,
    text,
    context: { tenantId: tenant.id, category: 'user_invitation', sessionId: null },
  });

  await logUserAction({
    tenantId: tenant.id,
    actorUserId: actor.id,
    targetUserId: target.id,
    action: 'users.invitation.resend',
    diff: { invitationId: invitation.id, via: 'script-22-09-resend' },
  });

  const sentForReal = mailResult.ok && !mailResult.dryRun && !mailResult.suppressed;
  console.log(
    `\n${sentForReal ? 'SENT' : 'NOT-SENT'} ${maskEmail(target.email)} invitationId=${invitation.id} expiresAt=${expiresAt.toISOString()} ` +
      `messageId=${mailResult.messageId ?? '-'} dryRun=${mailResult.dryRun ?? false} suppressed=${mailResult.suppressed ?? false} error=${mailResult.error ?? '-'}`,
  );
  await prisma.$disconnect();
  if (!sentForReal) {
    console.error('FAIL: le renvoi n\'est pas parti réellement.');
    process.exit(1);
  }
  console.log('WRITE terminé — renvoi parti réellement.');
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
