// Wave 0 stub — Phase 11 — implemented in Plan 11-06
import { describe, it } from 'vitest';

describe('invoice-reminder-worker', () => {
  it.todo('scan filtre status ∈ {ISSUED, PARTIAL, OVERDUE}');
  it.todo('filtre issueDate ≥ REMINDER_START_DATE (mitigation risque cascade R2)');
  it.todo('pour chaque tenant : lit Tenant.invoiceReminderDays par tick');
  it.todo('skip facture si reminderCount >= invoiceReminderDays.length');
  it.todo('skip facture si lastReminderAt > now - 24h');
  it.todo("appelle sendInvoiceReminder({ triggered_by: 'cron' }) pour chaque facture éligible");
  it.todo('scheduleDailyReminders inscrit job repeatable jobId=daily-reminders-cron');
  it.todo("scheduleDailyReminders cron pattern '0 8 * * *' tz Europe/Paris");
  it.todo('try/catch Redis indisponible → log warn + keepalive (pas de crash)');
});
