-- Spec signature électronique 2026-09-04 §4.2 — lot B.
-- Migration ADDITIVE, aucun backfill : `Document.status` reste une String et
-- les lignes existantes gardent "generated".
--
-- Apporte :
--   * SignatureRequest (+ statut) — une demande de signature chez un prestataire ;
--     `providerId` unique = clé de corrélation des webhooks.
--   * Document.signatureRequestId — un envoi porte 1..N documents (D-4 :
--     1 envoi par organisation = convention + N AGEFICE).
--   * Tenant.signatory* — le signataire OF (D-1), vide = fallback ENV OF_RESP_*.

-- CreateEnum
CREATE TYPE "SignatoryOrder" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'DONE', 'DECLINED', 'EXPIRED', 'CANCELED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "signatureRequestId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "signatoryEmail" TEXT,
ADD COLUMN     "signatoryName" TEXT,
ADD COLUMN     "signatoryOrder" "SignatoryOrder" NOT NULL DEFAULT 'AFTER',
ADD COLUMN     "signatoryTitle" TEXT;

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'docuseal',
    "providerId" TEXT NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "sessionId" TEXT NOT NULL,
    "signers" JSONB NOT NULL DEFAULT '[]',
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "auditTrailUrl" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_providerId_key" ON "SignatureRequest"("providerId");

-- CreateIndex
CREATE INDEX "SignatureRequest_tenantId_sessionId_idx" ON "SignatureRequest"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "SignatureRequest_tenantId_status_idx" ON "SignatureRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Document_tenantId_signatureRequestId_idx" ON "Document"("tenantId", "signatureRequestId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

