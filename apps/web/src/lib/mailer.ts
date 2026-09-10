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
 * TRAÇABILITÉ DES PIÈCES JOINTES (Lot 0 · 0.2, audit 28/08) : quand un envoi
 * emporte des `Document`, leurs ids sont passés dans `context.documentIds` et
 * une ligne `EmailMessage` est écrite APRÈS un départ SMTP réel. C'est la seule
 * preuve que l'application possède qu'un document a quitté la maison — elle
 * alimente la règle « document engagé » qui empêche de régénérer en silence une
 * convention déjà partie chez un financeur.
 *
 * Conséquence RGPD à connaître : jusqu'ici la table `EmailMessage` existait au
 * schéma mais n'avait AUCUN écrivain. Elle devient un stockage réel de données
 * personnelles (destinataire, objet, corps). À reporter au registre art. 30 et
 * à couvrir par une durée de conservation.
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
  /**
   * Ids des `Document` réellement joints à cet envoi. Non vide ⇒ une ligne
   * `EmailMessage` est écrite après un départ SMTP réel (ni dry-run, ni
   * suppression par réglages, ni échec : on ne trace que ce qui est parti).
   */
  documentIds?: string[];
  /** Rattachement libre pour la relecture (ex. `opcoSubmission:<id>`). */
  relatedEntity?: string | null;
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

/**
 * Écrit la trace d'un envoi qui emportait des documents. Ne relance jamais :
 * le mail EST parti, perdre la trace est ennuyeux, faire croire à un échec
 * d'envoi le serait davantage.
 */
async function tracerDocumentsEnvoyes(input: SendMailInput, from: string): Promise<void> {
  const documentIds = input.context.documentIds ?? [];
  if (documentIds.length === 0) return;
  try {
    await prisma.emailMessage.create({
      data: {
        tenantId: input.context.tenantId,
        fromEmail: from,
        toEmails: [input.to],
        subject: input.subject,
        bodyHtml: input.html,
        status: 'sent',
        sentAt: new Date(),
        relatedEntity: input.context.relatedEntity ?? null,
        documentIds,
      },
    });
  } catch (e) {
    console.error(
      `[mailer] trace d'envoi non enregistrée (${documentIds.length} document(s)) :`,
      e instanceof Error ? e.message : e,
    );
  }
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
    // Lot 0 · 0.2 — le document a quitté la maison : on l'écrit, sinon on ne
    // pourra plus jamais le savoir.
    await tracerDocumentsEnvoyes(input, from);
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    console.error('[mailer] send failed', e?.message ?? e);
    return { ok: false, error: e?.message ?? String(e) };
  }
}
