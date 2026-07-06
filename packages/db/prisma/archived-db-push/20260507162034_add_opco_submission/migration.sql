-- CreateEnum
CREATE TYPE "OpcoSubmissionStatus" AS ENUM ('DRAFT', 'SENT', 'ACK_RECEIVED', 'APPROVED', 'REJECTED', 'REIMBURSED', 'CANCELED');

-- CreateTable
CREATE TABLE "OpcoSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sponsorOrgId" TEXT NOT NULL,
    "status" "OpcoSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientEmail" TEXT,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "attachments" JSONB NOT NULL,
    "threadId" TEXT,
    "sentAt" TIMESTAMP(3),
    "ackAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "reimbursedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderSentAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpcoSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpcoSubmission_participantId_idx" ON "OpcoSubmission"("participantId");

-- CreateIndex
CREATE INDEX "OpcoSubmission_sponsorOrgId_idx" ON "OpcoSubmission"("sponsorOrgId");

-- CreateIndex
CREATE INDEX "OpcoSubmission_status_idx" ON "OpcoSubmission"("status");

-- CreateIndex
CREATE INDEX "OpcoSubmission_tenantId_status_idx" ON "OpcoSubmission"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "OpcoSubmission" ADD CONSTRAINT "OpcoSubmission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcoSubmission" ADD CONSTRAINT "OpcoSubmission_sponsorOrgId_fkey" FOREIGN KEY ("sponsorOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
