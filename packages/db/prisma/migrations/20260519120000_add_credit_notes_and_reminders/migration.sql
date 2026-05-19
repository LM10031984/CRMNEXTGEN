-- AlterTable Invoice
ALTER TABLE "Invoice" ADD COLUMN "originalInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- Self-FK (avoir → facture originale)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey"
  FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index pour requêtes worker daily (filtre status + lastReminderAt)
CREATE INDEX "Invoice_tenantId_status_lastReminderAt_idx"
  ON "Invoice"("tenantId", "status", "lastReminderAt");

-- Index pour lookup "Quels avoirs sont liés à cette facture ?"
CREATE INDEX "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");

-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN "creditNotePrefix" TEXT DEFAULT 'AVO';
ALTER TABLE "Tenant" ADD COLUMN "invoiceReminderDays" INTEGER[] DEFAULT ARRAY[30, 45]::INTEGER[];
