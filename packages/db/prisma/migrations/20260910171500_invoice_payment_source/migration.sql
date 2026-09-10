-- CreateEnum
CREATE TYPE "InvoicePaymentSource" AS ENUM ('MANUAL', 'OPCO_SYNC');

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "source" "InvoicePaymentSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_source_idx" ON "InvoicePayment"("invoiceId", "source");
