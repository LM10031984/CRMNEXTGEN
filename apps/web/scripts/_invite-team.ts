/**
 * Phase 22 Plan 22-09 — Invitations équipe de départ (D-09, dernier critère CUT-01).
 *
 * Réutilise EXACTEMENT le flux `inviteUser` de
 * `src/server/actions/tenant-users.ts` (Phase 8) — même transaction
 * User + UserInvitation, même template `renderInvitationEmail`, même
 * `sendMail` contextualisé `user_invitation`, même AuditLog `users.invite`.
 * Seul le wrapper server-action est inapplicable en script : `requireRole`
 * lit les cookies de la requête Next (indisponibles hors app). L'acteur
 * (`invitedBy`) est résolu explicitement sur un User ADMIN existant du tenant.
 *
 * GARDE-FOUS (fail-loud, AUCUN envoi si un seul échoue) :
 *   1. TenantEmailSettings : emailsEnabled=true ET userInvitationsEnabled=true
 *      (garde-fou 22-11 — les invitations n'ont pas de sessionId, l'interrupteur
 *      général DOIT être ON).
 *   2. NEXT_PUBLIC_APP_URL === https://qualiof.vercel.app (le lien d'invitation
 *      doit pointer la prod, pas localhost — surcharger en CLI, dotenv-cli ne
 *      réécrit pas une variable déjà posée dans le shell).
 *   3. SMTP configuré et MAIL_DRY_RUN !== true (sinon l'email ne partirait pas).
 *   4. Email déjà utilisé → SKIP consigné (cas Laurent : compte existant possible).
 *
 * SÉCURITÉ (convention projet — envoi réel = étape séparée) :
 *   - DRY par défaut : lecture seule, état des réglages + des comptes.
 *   - WRITE=1 : crée les Users + invitations et ENVOIE les emails réels.
 *
 * Usage (depuis apps/web) :
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/_invite-team.ts             # DRY
 *   NEXT_PUBLIC_APP_URL=https://qualiof.vercel.app WRITE=1 \
 *     pnpm exec dotenv -e ../../.env -- tsx scripts/_invite-team.ts           # WRITE
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '@qualiof/db';
import type { UserRole } from '@qualiof/db';
import { sendMail } from '../src/lib/mailer';
import { renderInvitationEmail } from '../src/lib/mailer-templates/user-invitation';
import { loadOfConfig } from '../src/lib/of-config';
import { logUserAction } from '../src/lib/audit-log';

const WRITE = process.env.WRITE === '1';
const PROD_URL = 'https://qualiof.vercel.app';
const INVITATION_VALIDITY_DAYS = 7; // identique tenant-users.ts:47

/** Liste fournie et validée par Laurent (checkpoint 22-09 Task 1, 2026-08-04). */
const TEAM: Array<{ firstName: string; lastName: string; email: string; role: UserRole }> = [
  { firstName: 'Béatrice', lastName: 'Le Cabellec', email: 'formation@start-academy.fr', role: 'ADMIN' },
  { firstName: 'Jean-Guy', lastName: 'Ourmières', email: 'jean-guy@start-academy.fr', role: 'ADMIN' },
  { firstName: 'Laurent', lastName: 'Marx', email: 'laurent@start-academy.fr', role: 'ADMIN' },
];

// Helpers identiques à tenant-users.ts (token 32 hex, expiration J+7).
function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}
function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_VALIDITY_DAYS * 86400 * 1000);
}
function publicInvitationUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, '')}/invitation/${token}`;
}
function maskEmail(email: string): string {
  return email.replace(/^(.)[^@]*(@.+)$/, '$1***$2');
}

async function main() {
  console.log(`=== _invite-team — mode ${WRITE ? 'WRITE (envoi réel)' : 'DRY (lecture seule)'} ===`);

  // ── Tenant unique ────────────────────────────────────────────────────
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length !== 1) {
    console.error(`FAIL: ${tenants.length} tenants trouvés (attendu 1):`, tenants.map((t) => t.name));
    process.exit(2);
  }
  const tenant = tenants[0]!;
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // ── Garde-fou 22-11 : réglages emails ────────────────────────────────
  const settings = await prisma.tenantEmailSettings.findUnique({ where: { tenantId: tenant.id } });
  console.log('TenantEmailSettings:', settings
    ? {
        emailsEnabled: settings.emailsEnabled,
        userInvitationsEnabled: settings.userInvitationsEnabled,
        internalNotificationsEnabled: settings.internalNotificationsEnabled,
        invoiceRemindersEnabled: settings.invoiceRemindersEnabled,
        testSessionIds: settings.testSessionIds.length,
        updatedAt: settings.updatedAt.toISOString(),
      }
    : 'ABSENT (fail-closed : tout supprimé)');
  const settingsOk = settings?.emailsEnabled === true && settings?.userInvitationsEnabled === true;
  if (!settingsOk && WRITE) {
    console.error('FAIL: garde-fou fermé — il faut emailsEnabled=true ET userInvitationsEnabled=true.');
    process.exit(3);
  }
  if (!settingsOk) {
    console.warn('⚠ DRY: garde-fou fermé (emailsEnabled=true ET userInvitationsEnabled=true requis avant WRITE).');
  }

  // ── Environnement d'envoi ────────────────────────────────────────────
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const mailDryRun = process.env.MAIL_DRY_RUN === 'true' || !process.env.SMTP_HOST;
  console.log(`NEXT_PUBLIC_APP_URL=${base} | SMTP_HOST=${process.env.SMTP_HOST ? 'SET' : 'ABSENT'} | dry-run env=${mailDryRun}`);
  if (WRITE && base !== PROD_URL) {
    console.error(`FAIL: NEXT_PUBLIC_APP_URL doit être ${PROD_URL} en WRITE (lien d'invitation).`);
    process.exit(4);
  }
  if (WRITE && mailDryRun) {
    console.error('FAIL: la couche env est en dry-run — l’email ne partirait pas réellement.');
    process.exit(5);
  }

  // ── État des comptes + acteur ADMIN ──────────────────────────────────
  const existingUsers = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, email: true, role: true, disabledAt: true, lastLoginAt: true, invitedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nUsers existants du tenant (${existingUsers.length}):`);
  for (const u of existingUsers) {
    console.log(`  - ${maskEmail(u.email)} role=${u.role} disabled=${u.disabledAt ? 'OUI' : 'non'} lastLogin=${u.lastLoginAt?.toISOString() ?? 'jamais'}`);
  }

  // Acteur invitedBy : Laurent s'il a déjà un compte ADMIN actif, sinon l'admin e2e.
  const actor =
    existingUsers.find((u) => u.email === 'laurent@start-academy.fr' && u.role === 'ADMIN' && !u.disabledAt) ??
    existingUsers.find((u) => u.email === 'e2e@start-academy.fr' && u.role === 'ADMIN' && !u.disabledAt);
  if (!actor) {
    console.error('FAIL: aucun acteur ADMIN actif trouvé (laurent@ ni e2e@).');
    process.exit(6);
  }
  console.log(`Acteur invitedBy: ${maskEmail(actor.email)} (${actor.id})`);

  // ── Plan d'action par membre ─────────────────────────────────────────
  const toInvite: typeof TEAM = [];
  for (const m of TEAM) {
    const existing = await prisma.user.findUnique({
      where: { email: m.email },
      select: { id: true, tenantId: true, role: true, disabledAt: true, lastLoginAt: true },
    });
    if (existing) {
      console.log(`SKIP ${maskEmail(m.email)} — compte User existant (role=${existing.role}, tenant ${existing.tenantId === tenant.id ? 'OK' : 'AUTRE!'}, lastLogin=${existing.lastLoginAt?.toISOString() ?? 'jamais'})`);
      continue;
    }
    console.log(`À INVITER: ${m.firstName} ${m.lastName} <${maskEmail(m.email)}> — ${m.role}`);
    toInvite.push(m);
  }

  if (!WRITE) {
    console.log(`\nDRY terminé — ${toInvite.length} invitation(s) partiraient en WRITE=1. Aucune écriture.`);
    await prisma.$disconnect();
    return;
  }

  // ── WRITE : flux inviteUser répliqué à l'identique ───────────────────
  const of = await loadOfConfig(tenant.id);
  let failures = 0;
  for (const m of toInvite) {
    const token = generateToken();
    const expiresAt = invitationExpiry();

    const { newUser, invitation } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: m.email,
          hashedPwd: '', // placeholder — défini via /invitation/[token] (Phase 8)
          firstName: m.firstName,
          lastName: m.lastName,
          role: m.role,
          invitedAt: new Date(),
          invitedBy: actor.id,
        },
      });
      const invitation = await tx.userInvitation.create({
        data: {
          tenantId: tenant.id,
          email: m.email,
          token,
          role: m.role,
          expiresAt,
          userId: newUser.id,
          invitedBy: actor.id,
        },
      });
      return { newUser, invitation };
    });

    const { subject, html, text } = renderInvitationEmail(
      {
        firstName: m.firstName,
        publicUrl: publicInvitationUrl(base, token),
        expiresAt,
        invitedByName: 'Laurent Marx',
      },
      of,
    );
    const mailResult = await sendMail({
      to: m.email,
      subject,
      html,
      text,
      context: { tenantId: tenant.id, category: 'user_invitation', sessionId: null },
    });

    await logUserAction({
      tenantId: tenant.id,
      actorUserId: actor.id,
      targetUserId: newUser.id,
      action: 'users.invite',
      diff: { email: m.email, role: m.role, invitationId: invitation.id, via: 'script-22-09' },
    });

    const sentForReal = mailResult.ok && !mailResult.dryRun && !mailResult.suppressed;
    console.log(
      `${sentForReal ? 'SENT' : 'NOT-SENT'} ${maskEmail(m.email)} userId=${newUser.id} invitationId=${invitation.id} ` +
        `messageId=${mailResult.messageId ?? '-'} dryRun=${mailResult.dryRun ?? false} suppressed=${mailResult.suppressed ?? false} error=${mailResult.error ?? '-'}`,
    );
    if (!sentForReal) failures++;
  }

  // ── Contrôle post-write ──────────────────────────────────────────────
  const check = await prisma.user.findMany({
    where: { email: { in: TEAM.map((m) => m.email) } },
    select: { id: true, email: true, role: true, tenantId: true, invitedAt: true, lastLoginAt: true },
    orderBy: { email: 'asc' },
  });
  console.log('\nContrôle Users en base:');
  for (const u of check) {
    console.log(`  ${maskEmail(u.email)} role=${u.role} tenant=${u.tenantId === tenant.id ? 'OK' : 'AUTRE!'} invitedAt=${u.invitedAt?.toISOString() ?? 'null'} lastLogin=${u.lastLoginAt?.toISOString() ?? 'jamais'}`);
  }

  await prisma.$disconnect();
  if (failures > 0) {
    console.error(`\nFAIL: ${failures} envoi(s) non partis réellement.`);
    process.exit(1);
  }
  console.log('\nWRITE terminé — toutes les invitations sont parties réellement.');
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
