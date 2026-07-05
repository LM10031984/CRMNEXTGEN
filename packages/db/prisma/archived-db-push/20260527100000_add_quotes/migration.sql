-- Module Devis : Quote + QuoteLine + enum QuoteStatus.
-- Workflow hybride : destinataire libre (texte) mais traçabilité optionnelle
-- du pré-remplissage via sourceProductId / sourcePersonId / sourceOrgId.

CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

CREATE TABLE "Quote" (
  "id"               TEXT PRIMARY KEY,
  "tenantId"         TEXT NOT NULL,
  "number"           TEXT NOT NULL UNIQUE,
  "status"           "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "recipientName"    TEXT NOT NULL,
  "recipientContact" TEXT,
  "recipientAddress" TEXT,
  "recipientEmail"   TEXT,
  "recipientSiret"   TEXT,
  "sourceProductId"  TEXT,
  "sourcePersonId"   TEXT,
  "sourceOrgId"      TEXT,
  "headerCustomMd"   TEXT,
  "title"            TEXT NOT NULL DEFAULT 'Devis de formation',
  "notes"            TEXT,
  "validUntil"       TIMESTAMP(3),
  "amountHT"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "amountVAT"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "amountTTC"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "issuedAt"         TIMESTAMP(3),
  "acceptedAt"       TIMESTAMP(3),
  "rejectedAt"       TIMESTAMP(3),
  "pdfUrl"           TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);

CREATE INDEX "Quote_tenantId_status_idx"    ON "Quote"("tenantId", "status");
CREATE INDEX "Quote_tenantId_createdAt_idx" ON "Quote"("tenantId", "createdAt");

CREATE TABLE "QuoteLine" (
  "id"          TEXT PRIMARY KEY,
  "quoteId"     TEXT NOT NULL,
  "order"       INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity"    DECIMAL(10,2) NOT NULL DEFAULT 1,
  "unitPriceHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "vatRate"     DECIMAL(5,2) NOT NULL DEFAULT 0,
  "lineTotalHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "QuoteLine_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "QuoteLine_quoteId_order_idx" ON "QuoteLine"("quoteId", "order");
