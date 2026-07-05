-- AlterTable
ALTER TABLE "SessionTrainer" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SessionTrainer_sessionId_isPrimary_idx" ON "SessionTrainer"("sessionId", "isPrimary");

-- Backfill : marque comme primary le 1er formateur (ordre id ASC) de chaque session existante
UPDATE "SessionTrainer" st1
SET "isPrimary" = true
WHERE st1.id = (
  SELECT st2.id
  FROM "SessionTrainer" st2
  WHERE st2."sessionId" = st1."sessionId"
  ORDER BY st2.id ASC
  LIMIT 1
);
