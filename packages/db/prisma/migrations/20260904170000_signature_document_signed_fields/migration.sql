-- Spec signature électronique 2026-09-04 §4.1 — migration ADDITIVE, aucun backfill.
-- `Document.status` reste une String : les lignes existantes gardent "generated".

-- CreateEnum
CREATE TYPE "SignatureKind" AS ENUM ('E_SIGNATURE', 'MANUAL_SCAN');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "signatureKind" "SignatureKind",
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedPdfUrl" TEXT;
