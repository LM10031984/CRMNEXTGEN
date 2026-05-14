-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "bic" TEXT,
ADD COLUMN     "emailFrom" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "invoicePrefix" TEXT DEFAULT 'FAC',
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "legalMentions" TEXT,
ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "signatureDirigeantPath" TEXT,
ADD COLUMN     "signaturePedagoPath" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
