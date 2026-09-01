-- Quick 260901-qr7 : soumissions du diagnostic express du stand.
-- Migration 100 % ADDITIVE (nouvelle table + nouvel enum, aucun impact existant).

CREATE TYPE "DiagnosticProgrammeStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "DiagnosticSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "reponses" JSONB NOT NULL,
    "dominante" TEXT NOT NULL,
    "secondaire" TEXT,
    "scores" JSONB NOT NULL,
    "programmeStatus" "DiagnosticProgrammeStatus" NOT NULL DEFAULT 'PENDING',
    "programmeSentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "personnalisation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiagnosticSubmission_programmeStatus_createdAt_idx"
  ON "DiagnosticSubmission"("programmeStatus", "createdAt");
CREATE INDEX "DiagnosticSubmission_tenantId_idx"
  ON "DiagnosticSubmission"("tenantId");

ALTER TABLE "DiagnosticSubmission"
  ADD CONSTRAINT "DiagnosticSubmission_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
