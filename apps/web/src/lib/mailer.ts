/**
 * Service mail QualiOF — abstraction sur nodemailer/SMTP.
 *
 * Si SMTP_HOST n'est pas configuré dans .env → mode "log-only" (dry-run) :
 * le mail n'est PAS envoyé, juste loggé en console. Permet de développer
 * sans risquer de spammer en production.
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
import { getOfConfig } from './of-config';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export interface SendMailResult {
  ok: boolean;
  messageId?: string;
  dryRun?: boolean;
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
  if (isDryRun()) {
    // RGPD (Phase 22 D-17) : jamais d'email destinataire en clair dans les logs.
    const maskedTo = String(input.to).replace(/^(.)[^@]*(@.+)$/, '$1***$2');
    console.log(`[mailer:dry-run] to=${maskedTo} subject="${input.subject}" (no SMTP_HOST configuré)`);
    return { ok: true, dryRun: true };
  }
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
