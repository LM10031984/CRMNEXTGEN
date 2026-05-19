// Wave 0 stub — Phase 11 — implemented in Plan 11-02
import { describe, it } from 'vitest';

describe('logInvoiceEvent', () => {
  it.todo('crée une row AuditLog avec entity=Invoice');
  it.todo('accepte actorUserId null (system / cron worker)');
  it.todo(
    'accepte les 6 actions namespacées : invoices.created / invoices.issued / invoices.payment_recorded / invoices.credit_note_created / invoices.reminder_sent / invoices.exported',
  );
  it.todo('sérialise le diff en JSON (Record<string, unknown>)');
  it.todo('ne no-op PAS sur diff vide (cohérent D-Phase9-H)');
});
