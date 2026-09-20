ALTER TABLE "Organization" ADD COLUMN "crmManagers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead"
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "segments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "importKey" TEXT,
  ADD COLUMN "importData" JSONB,
  ADD COLUMN "callCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lossReason" TEXT;
ALTER TABLE "LeadAction"
  ADD COLUMN "authorUserId" TEXT,
  ADD COLUMN "authorName" TEXT,
  ADD COLUMN "outcome" TEXT,
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "statusAfter" TEXT;
CREATE UNIQUE INDEX "Lead_tenantId_importKey_key" ON "Lead"("tenantId", "importKey");
CREATE INDEX "Lead_tenantId_nextActionAt_idx" ON "Lead"("tenantId", "nextActionAt");
