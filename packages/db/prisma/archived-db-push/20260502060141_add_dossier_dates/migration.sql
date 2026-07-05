-- AlterTable
ALTER TABLE "SessionParticipant" ADD COLUMN     "invoiceSentAt" TIMESTAMP(3),
ADD COLUMN     "opcoApprovedAt" TIMESTAMP(3),
ADD COLUMN     "opcoReimbursedAt" TIMESTAMP(3),
ADD COLUMN     "paymentReceivedAt" TIMESTAMP(3);
