-- AlterTable: relances email auto pour les pré-inscriptions PENDING_FORM
ALTER TABLE "PreEnrollment"
  ADD COLUMN "lastReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
