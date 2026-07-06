-- CreateEnum
CREATE TYPE "DossierType" AS ENUM ('FORMATION', 'PREINSCRIPTION_BUDGET');

-- AlterTable
ALTER TABLE "SessionParticipant" ADD COLUMN     "dossierType" "DossierType" NOT NULL DEFAULT 'FORMATION';

-- CreateIndex
CREATE INDEX "SessionParticipant_dossierType_idx" ON "SessionParticipant"("dossierType");
