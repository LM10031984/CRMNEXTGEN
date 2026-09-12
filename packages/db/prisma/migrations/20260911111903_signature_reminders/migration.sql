-- AlterTable
ALTER TABLE "SignatureRequest" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "SignatureRequest_status_sentAt_idx" ON "SignatureRequest"("status", "sentAt");
