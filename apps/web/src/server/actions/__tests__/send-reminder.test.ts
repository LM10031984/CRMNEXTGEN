// Wave 0 stub — Phase 11 — implemented in Plan 11-06
import { describe, it } from 'vitest';

describe('sendInvoiceReminder', () => {
  it.todo('triggered_by=manual + RBAC COMMERCIAL → ForbiddenError');
  it.todo('triggered_by=cron → skip requireRole (worker système)');
  it.todo('skip auto si status=PAID (auto-stop D-13)');
  it.todo('skip auto si status=CANCELLED');
  it.todo('skip si lastReminderAt > now - 24h (idempotence cron D-13b)');
  it.todo("manual ignore l'idempotence 24h (D-09 — confiance utilisateur)");
  it.todo('compute level = clamp(reminderCount + 1, 1, invoiceReminderDays.length)');
  it.todo('appelle sendMail + renderInvoiceReminderEmail avec input correct');
  it.todo('dry-run quand SMTP_HOST vide → AuditLog avec diff.dryRun=true');
  it.todo('update Invoice { lastReminderAt: now, reminderCount: { increment: 1 } }');
  it.todo('crée AuditLog invoices.reminder_sent avec diff {level, channel:email, triggered_by, dryRun, daysOverdue}');
  it.todo("retourne { ok: false, error: 'Aucun email payeur configuré' } si tous emails null");
});
