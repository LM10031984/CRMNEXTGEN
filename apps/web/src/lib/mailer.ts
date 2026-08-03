/**
 * Service mail QualiOF — abstraction sur nodemailer/SMTP.
 *
 * DEUX COUCHES DE GARDE (Phase 22 Plan 22-11, D-06) :
 *  1. env (plomberie), PRIORITAIRE : si MAIL_DRY_RUN=true ou SMTP_HOST vide →
 *     mode "log-only" (dry-run), AUCUNE lecture BDD. Permet de développer sans
 *     risquer de spammer, et garde le dev local intact.
 *  2. BDD (métier), fail-closed : `TenantEmailSettings` par tenant (interrupteur
 *     général + toggles par catégorie + sessions autorisées en mode test),
 *     piloté depuis Paramètres organisme. Sans réglage explicite de l'ADMIN,
 *     TOUT est supprimé — même après MAIL_DRY_RUN=false. Une suppression est
 *     tracée `[mailer:suppressed-by-settings]` (destinataire masqué, D-17) et
 *     retournée `{ ok:true, dryRun:true, suppressed:true }` — jamais de throw.
 *
 * Le champ `context` de SendMailInput est REQUIS : impossible d'ajouter un
 * envoi non catégorisé (tsc échoue). Voir `email-policy.ts` pour la matrice.
 *
 * Variables .env :
 *   MAIL_DRY_RUN         — true pour forcer log-only même si SMTP configuré
 *   SMTP_HOST            — ex: ssl0.ovh.net, smtp.gmail.com
 *   SMTP_PORT            — 465 (TLS) / 587 (STARTTLS) / 25
 *   SMTP_SECURE          — true (TLS direct) ou false (STARTTLS) — auto si port=465
 *   SMTP_USER            — username/email
 *   SMTP_PASS            — password / app-password
 *   MAIL_FROM            — adresse expéditeur (ex: "Start Academy <formation@start-academy.fr>")
 *   MAIL_REPLY_TO        — adresse de réponse (optionnel)
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '@qualiof/db';
import { getOfConfig } from './of-config';
import { resolveEmailPolicy, type EmailCategory } from './email-policy';

/**
 * Contexte métier REQUIS de tout envoi (Phase 22 Plan 22-11) :
 * la catégorie pilote le toggle Paramètres, le sessionId permet le mode
 * « session test » quand l'interrupteur général est OFF.
 */
export interface SendMailContext {
  tenantId: string;
  category: EmailCategory;
  sessionId?: string | null;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  context: SendMailContext;
}

export interface SendMailResult {
  ok: boolean;
  messageId?: string;
  dryRun?: boolean;
  /** true si l'envoi a été bloqué par les réglages tenant (TenantEmailSettings). */
  suppressed?: boolean;
  error?: string;
}

let _transporter: Transporter | null = null;

function getFromAddress(): string {
  const fromEnv = process.env.MAIL_FROM?.trim();
  if (fromEnv) return fromEnv;
  // Phase 7 — Plan 07-01 : passe par of-config (ENV-only legacy ici car le
  // mailer n'a pas de contexte tenantId au call site). Quand emailFrom sera
  // édité depuis Paramètres (Plan 07-02+), le call site `sendMail()` pourra
  // pré-résoudre `loadOfConfig(tenantId)` et passer un `from` explicite.
  const of = getOfConfig();
  const ofName = of.name || 'Start Academy';
  const ofEmail = of.emailFrom || of.email || 'formation@start-academy.fr';
  return `${ofName} <${ofEmail}>`;
}

function isDryRun(): boolean {
  if (process.env.MAIL_DRY_RUN === 'true') return true;
  return !process.env.SMTP_HOST;
}

/** RGPD (Phase 22 D-17) : jamais d'email destinataire en clair dans les logs. */
function maskRecipient(to: string): string {
  return String(to).replace(/^(.)[^@]*(@.+)$/, '$1***$2');
}

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error('SMTP_HOST non configuré');
  const port = Number(process.env.SMTP_PORT ?? '465');
  const secureEnv = process.env.SMTP_SECURE;
  const secure = secureEnv === 'true' || (secureEnv == null && port === 465);
  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return _transporter;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const from = getFromAddress();

  // ① Couche env (plomberie) — prioritaire, AUCUNE lecture BDD.
  if (isDryRun()) {
    console.log(
      `[mailer:dry-run] to=${maskRecipient(input.to)} subject="${input.subject}" category=${input.context.category} (no SMTP_HOST configuré)`,
    );
    return { ok: true, dryRun: true };
  }

  // ② Couche BDD (métier) — fail-closed : pas de cache (volume faible, réglage
  // Paramètres pris en compte immédiatement).
  const settings = await prisma.tenantEmailSettings.findUnique({
    where: { tenantId: input.context.tenantId },
  });

  // ③ Décision pure (matrice email-policy.ts).
  const policy = resolveEmailPolicy(settings, {
    category: input.context.category,
    sessionId: input.context.sessionId ?? null,
  });

  // ④ Suppression tracée — retour dry-run côté call-site, jamais d'erreur.
  if (policy.decision === 'suppress') {
    console.log(
      `[mailer:suppressed-by-settings] category=${input.context.category} reason=${policy.reason} to=${maskRecipient(input.to)} subject="${input.subject}"`,
    );
    return { ok: true, dryRun: true, suppressed: true };
  }

  // ⑤ Envoi SMTP normal (chemin existant intact).
  try {
    const info = await getTransporter().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: process.env.MAIL_REPLY_TO,
      attachments: input.attachments,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    console.error('[mailer] send failed', e?.message ?? e);
    return { ok: false, error: e?.message ?? String(e) };
  }
}
