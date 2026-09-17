-- CreateEnum
CREATE TYPE "SessionRegime" AS ENUM ('ENTREPRISE', 'INDIVIDUEL');

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "priceTotalHT" DECIMAL(10,2),
ADD COLUMN     "regime" "SessionRegime";

