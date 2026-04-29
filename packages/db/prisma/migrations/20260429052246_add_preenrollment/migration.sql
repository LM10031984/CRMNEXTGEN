-- CreateEnum
CREATE TYPE "PreEnrollmentStatus" AS ENUM ('PENDING_FORM', 'SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED', 'CONVERTED', 'EXPIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "PreEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentByUserId" TEXT,
    "sentTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "birthPlace" TEXT,
    "professionalStatus" TEXT,
    "educationLevel" TEXT,
    "diploma" TEXT,
    "professionalExperience" TEXT,
    "cniKey" TEXT,
    "ribKey" TEXT,
    "cfpKey" TEXT,
    "rgpdAcceptedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "status" "PreEnrollmentStatus" NOT NULL DEFAULT 'PENDING_FORM',
    "extractedData" JSONB,
    "aiExtractedAt" TIMESTAMP(3),
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "aiErrorMsg" TEXT,
    "validatedByUserId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "convertedToPersonId" TEXT,
    "convertedToOrgId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "intendedSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreEnrollment_token_key" ON "PreEnrollment"("token");

-- CreateIndex
CREATE INDEX "PreEnrollment_tenantId_status_idx" ON "PreEnrollment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PreEnrollment_token_idx" ON "PreEnrollment"("token");

-- AddForeignKey
ALTER TABLE "PreEnrollment" ADD CONSTRAINT "PreEnrollment_intendedSessionId_fkey" FOREIGN KEY ("intendedSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
