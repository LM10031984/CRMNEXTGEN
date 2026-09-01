/**
 * Politique d'envoi d'emails par tenant — Phase 22 Plan 22-11 (D-06).
 *
 * Module NEUTRE worker-safe : zéro import React/auth/env/prisma. La décision
 * est une fonction PURE sur un snapshot des réglages `TenantEmailSettings`
 * (chargé par le chokepoint `mailer.ts`) — testable sans mock.
 *
 * Deux couches de garde au chokepoint `sendMail` :
 *   1. env (plomberie)  : MAIL_DRY_RUN / SMTP_HOST vide — PRIORITAIRE, hors scope ici.
 *   2. BDD (métier)     : cette policy — fail-closed : sans ligne de réglages,
 *      ou sans catégorie cochée, AUCUN email ne part.
 *
 * Mode « session test » : interrupteur général OFF + catégorie cochée +
 * sessionId ∈ testSessionIds → send. C'est le SEUL chemin d'envoi master-off :
 * Laurent peut valider ses réglages sur une session témoin pendant que le
 * reste du parc reste silencieux.
 */

export type EmailCategory =
  | 'invoice_reminder'
  | 'preinscription_reminder'
  | 'opco_reminder'
  | 'opco_submission'
  | 'internal_notification'
  | 'user_invitation'
  | 'diagnostic_program';

/**
 * Snapshot structurel des réglages — compatible avec le model Prisma
 * `TenantEmailSettings` (typage structurel : les champs id/tenantId/createdAt/
 * updatedAt supplémentaires ne gênent pas).
 */
export interface EmailPolicySettings {
  emailsEnabled: boolean;
  invoiceRemindersEnabled: boolean;
  preinscriptionRemindersEnabled: boolean;
  opcoRemindersEnabled: boolean;
  opcoSubmissionsEnabled: boolean;
  internalNotificationsEnabled: boolean;
  userInvitationsEnabled: boolean;
  diagnosticProgramsEnabled: boolean;
  testSessionIds: string[];
}

export interface EmailPolicyContext {
  category: EmailCategory;
  sessionId?: string | null;
}

export interface EmailPolicyDecision {
  decision: 'send' | 'suppress';
  reason?: 'no-settings' | 'category-off' | 'master-off';
}

/** Map catégorie → champ boolean des réglages. */
export const EMAIL_CATEGORY_FIELD: Record<EmailCategory, keyof Omit<EmailPolicySettings, 'testSessionIds'>> = {
  invoice_reminder: 'invoiceRemindersEnabled',
  preinscription_reminder: 'preinscriptionRemindersEnabled',
  opco_reminder: 'opcoRemindersEnabled',
  opco_submission: 'opcoSubmissionsEnabled',
  internal_notification: 'internalNotificationsEnabled',
  user_invitation: 'userInvitationsEnabled',
  diagnostic_program: 'diagnosticProgramsEnabled',
};

/** Libellés FR pour l'UI Paramètres organisme (section « Envois d'emails »). */
export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  invoice_reminder: 'Relances factures',
  preinscription_reminder: 'Rappels pré-inscription',
  opco_reminder: 'Relances dossiers OPCO',
  opco_submission: 'Envoi dossiers OPCO',
  internal_notification: 'Notifications internes (équipe)',
  user_invitation: 'Invitations utilisateurs',
  diagnostic_program: 'Programme du diagnostic express (stand)',
};

/**
 * Décision pure d'envoi selon les réglages tenant.
 *
 * Matrice :
 *  - settings null → suppress/no-settings (fail-closed : aucune ligne = rien ne part)
 *  - catégorie décochée → suppress/category-off (même en mode session test)
 *  - catégorie cochée + interrupteur ON → send
 *  - catégorie cochée + interrupteur OFF :
 *      · sessionId ∈ testSessionIds → send (mode session test)
 *      · sinon → suppress/master-off
 */
export function resolveEmailPolicy(
  settings: EmailPolicySettings | null,
  ctx: EmailPolicyContext,
): EmailPolicyDecision {
  if (!settings) return { decision: 'suppress', reason: 'no-settings' };

  const categoryEnabled = settings[EMAIL_CATEGORY_FIELD[ctx.category]];
  if (!categoryEnabled) return { decision: 'suppress', reason: 'category-off' };

  if (settings.emailsEnabled) return { decision: 'send' };

  if (ctx.sessionId && settings.testSessionIds.includes(ctx.sessionId)) {
    return { decision: 'send' };
  }

  return { decision: 'suppress', reason: 'master-off' };
}
