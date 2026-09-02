-- Chaîne Diagnostic → Proposition — lot A (socle)
-- Spec : .planning/specs/2026-09-01-chaine-diagnostic-proposition.md §4
--
-- Migration STRICTEMENT ADDITIVE : aucune colonne supprimée, aucune contrainte
-- durcie sur une table existante. Les 6 champs ajoutés à TrainingModule, le
-- fundingType de TrainingProduct, Quote.proposalId et PreEnrollment.batchId
-- sont nullables ou porteurs d'un défaut — les lignes existantes restent valides.
-- Aucune reprise de données historiques (besoin prospectif uniquement).


-- CreateEnum
CREATE TYPE "ProductFundingType" AS ENUM ('REGLEMENTAIRE', 'COEUR_METIER');

-- CreateEnum
CREATE TYPE "DiagnosticVariant" AS ENUM ('LEGER', 'COMPLET');

-- CreateEnum
CREATE TYPE "DiagnosticMode" AS ENUM ('GUIDE', 'TRANSCRIPT', 'HYBRIDE');

-- CreateEnum
CREATE TYPE "DiagnosticStatus" AS ENUM ('EN_COURS', 'TERMINE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "AnswerOrigin" AS ENUM ('COMMERCIAL', 'IA_TRANSCRIPT');

-- CreateEnum
CREATE TYPE "DiagParticipantStatut" AS ENUM ('INDEPENDANT', 'SALARIE', 'DIRIGEANT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('BROUILLON', 'PRETE', 'ENVOYEE', 'ACCEPTEE', 'REFUSEE', 'EXPIREE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OUVERTE', 'CLOTUREE', 'ANNULEE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "DocType" ADD VALUE 'DIAGNOSTIC_AUDIT';
ALTER TYPE "DocType" ADD VALUE 'PROPOSITION';

-- AlterTable
ALTER TABLE "PreEnrollment" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "proposalId" TEXT;

-- AlterTable
ALTER TABLE "TrainingModule" ADD COLUMN     "diagnosticSignals" JSONB,
ADD COLUMN     "excludedFromClientOutputs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "family" TEXT,
ADD COLUMN     "isFoundation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needIdentification" TEXT,
ADD COLUMN     "targetProfile" TEXT;

-- AlterTable
ALTER TABLE "TrainingProduct" ADD COLUMN     "fundingType" "ProductFundingType" NOT NULL DEFAULT 'COEUR_METIER';

-- CreateTable
CREATE TABLE "FundingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueNumeric" DECIMAL(12,2),
    "valueText" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnostic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizationId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "variant" "DiagnosticVariant" NOT NULL DEFAULT 'LEGER',
    "mode" "DiagnosticMode" NOT NULL DEFAULT 'GUIDE',
    "status" "DiagnosticStatus" NOT NULL DEFAULT 'EN_COURS',
    "meetingAt" TIMESTAMP(3),
    "r2PlannedAt" TIMESTAMP(3),
    "referentialVersion" TEXT NOT NULL,
    "declaredGoal" TEXT,
    "expectedParticipants" INTEGER,
    "transcriptText" TEXT,
    "transcriptSource" TEXT,
    "prefillModel" TEXT,
    "prefillAt" TIMESTAMP(3),
    "computedSnapshot" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagnostic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticAnswer" (
    "id" TEXT NOT NULL,
    "diagnosticId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB,
    "isSkipped" BOOLEAN NOT NULL DEFAULT false,
    "origin" "AnswerOrigin" NOT NULL DEFAULT 'COMMERCIAL',
    "aiConfidence" DECIMAL(4,3),
    "aiQuote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticParticipant" (
    "id" TEXT NOT NULL,
    "diagnosticId" TEXT NOT NULL,
    "personId" TEXT,
    "displayName" TEXT NOT NULL,
    "statut" "DiagParticipantStatut" NOT NULL,
    "fonction" TEXT,
    "fullTime" BOOLEAN,
    "entryDate" TIMESTAMP(3),
    "experienceLevel" TEXT,
    "caN1" DECIMAL(12,2),
    "caCurrent" DECIMAL(12,2),
    "opcoEligible" BOOLEAN,
    "trainings24mCount" INTEGER,
    "trainings24mHours" INTEGER,
    "trainings24mFunded" DECIMAL(12,2),
    "wantsTraining" BOOLEAN,
    "priorityNeed" TEXT,
    "objectiveCa" DECIMAL(12,2),
    "strengths" TEXT,
    "includedInProposal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "diagnosticId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizationId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'BROUILLON',
    "title" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "contentJson" JSONB NOT NULL,
    "pricingJson" JSONB NOT NULL,
    "fundingJson" JSONB NOT NULL,
    "generationSource" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "publicTokenHash" TEXT,
    "publicTokenExpiresAt" TIMESTAMP(3),
    "pdfKey" TEXT,
    "sourceFingerprint" TEXT,
    "sessionId" TEXT,
    "batchId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "diagnosticId" TEXT,
    "proposalId" TEXT,
    "productId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchStatus" NOT NULL DEFAULT 'OUVERTE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchDateOption" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "isRetained" BOOLEAN NOT NULL DEFAULT false,
    "votes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchDateOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingRule_tenantId_key_validTo_idx" ON "FundingRule"("tenantId", "key", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "Diagnostic_reference_key" ON "Diagnostic"("reference");

-- CreateIndex
CREATE INDEX "Diagnostic_tenantId_status_idx" ON "Diagnostic"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Diagnostic_tenantId_ownerUserId_status_idx" ON "Diagnostic"("tenantId", "ownerUserId", "status");

-- CreateIndex
CREATE INDEX "Diagnostic_organizationId_idx" ON "Diagnostic"("organizationId");

-- CreateIndex
CREATE INDEX "DiagnosticAnswer_diagnosticId_idx" ON "DiagnosticAnswer"("diagnosticId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAnswer_diagnosticId_questionId_key" ON "DiagnosticAnswer"("diagnosticId", "questionId");

-- CreateIndex
CREATE INDEX "DiagnosticParticipant_diagnosticId_idx" ON "DiagnosticParticipant"("diagnosticId");

-- CreateIndex
CREATE INDEX "DiagnosticParticipant_personId_idx" ON "DiagnosticParticipant"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_reference_key" ON "Proposal"("reference");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_status_idx" ON "Proposal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Proposal_diagnosticId_idx" ON "Proposal"("diagnosticId");

-- CreateIndex
CREATE INDEX "Proposal_leadId_idx" ON "Proposal"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentBatch_diagnosticId_key" ON "EnrollmentBatch"("diagnosticId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentBatch_tokenHash_key" ON "EnrollmentBatch"("tokenHash");

-- CreateIndex
CREATE INDEX "EnrollmentBatch_tenantId_status_idx" ON "EnrollmentBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BatchDateOption_batchId_idx" ON "BatchDateOption"("batchId");

-- CreateIndex
CREATE INDEX "PreEnrollment_batchId_status_idx" ON "PreEnrollment"("batchId", "status");

-- CreateIndex
CREATE INDEX "Quote_proposalId_idx" ON "Quote"("proposalId");

-- CreateIndex
CREATE INDEX "TrainingModule_family_idx" ON "TrainingModule"("family");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEnrollment" ADD CONSTRAINT "PreEnrollment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EnrollmentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnostic" ADD CONSTRAINT "Diagnostic_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnostic" ADD CONSTRAINT "Diagnostic_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnostic" ADD CONSTRAINT "Diagnostic_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticAnswer" ADD CONSTRAINT "DiagnosticAnswer_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "Diagnostic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticParticipant" ADD CONSTRAINT "DiagnosticParticipant_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "Diagnostic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticParticipant" ADD CONSTRAINT "DiagnosticParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "Diagnostic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentBatch" ADD CONSTRAINT "EnrollmentBatch_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "Diagnostic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentBatch" ADD CONSTRAINT "EnrollmentBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchDateOption" ADD CONSTRAINT "BatchDateOption_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EnrollmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Une seule règle de financement ACTIVE par clé et par tenant.
--
-- Prisma ne sait pas décrire un index unique partiel : il vit donc ici, en SQL,
-- comme dans le repo diag. Sans lui, deux lignes AGEFICE_ANNUAL_CAP ouvertes en
-- même temps rendraient le plafond non déterministe — et un chiffrage non
-- déterministe n'est pas défendable devant un financeur.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "FundingRule_tenantId_key_active_key"
  ON "FundingRule" ("tenantId", "key")
  WHERE "validTo" IS NULL;
