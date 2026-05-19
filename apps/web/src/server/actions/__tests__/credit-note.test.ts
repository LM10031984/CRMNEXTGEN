// Wave 0 stub — Phase 11 — implemented in Plan 11-05
import { describe, it } from 'vitest';

describe('createCreditNote', () => {
  it.todo('avoir total (amountHtToCredit === original.amountHt) → facture origine passe à CANCELLED');
  it.todo('avoir partiel (amountHtToCredit < original.amountHt) → facture origine inchangée');
  it.todo('refuse si status origine ∈ {DRAFT, CANCELLED, CREDIT_NOTE}');
  it.todo('refuse si amountHtToCredit > original.amountHt');
  it.todo('refuse si motif vide ou < 3 caractères (Zod)');
  it.todo('génère un AVO-NNNNNN via getNextCreditNoteNumber en transaction');
  it.todo('stocke amountHT et amountTTC NÉGATIFS côté BDD');
  it.todo('crée AuditLog invoices.credit_note_created avec diff {originalInvoiceId, amountHtCredited, motif}');
  it.todo('RBAC : COMMERCIAL → ForbiddenError; FORMATEUR → ForbiddenError');
  it.todo('RBAC : ADMIN/MANAGER/COMPTABLE → OK');
  it.todo("appelle revalidatePath('/app/factures') et /app/factures/[originalId]");
});
