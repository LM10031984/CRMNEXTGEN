-- CreateEnum
CREATE TYPE "ClosureDocKind" AS ENUM ('ATTESTATION', 'CERTIFICAT', 'QCM', 'GRILLE_OBS', 'ANALYSE_BESOIN');

-- CreateEnum
CREATE TYPE "ClosureBatchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ClosureJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "ClosureBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "ClosureBatchStatus" NOT NULL DEFAULT 'PENDING',
    "totalDocs" INTEGER NOT NULL DEFAULT 0,
    "doneDocs" INTEGER NOT NULL DEFAULT 0,
    "errorDocs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosureBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosureJob" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "kind" "ClosureDocKind" NOT NULL,
    "status" "ClosureJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "documentId" TEXT,
    "pedagogicalAssetId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosureJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClosureBatch_tenantId_sessionId_idx" ON "ClosureBatch"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "ClosureBatch_status_idx" ON "ClosureBatch"("status");

-- CreateIndex
CREATE INDEX "ClosureJob_batchId_status_idx" ON "ClosureJob"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClosureJob_batchId_participantId_kind_key" ON "ClosureJob"("batchId", "participantId", "kind");

-- AddForeignKey
ALTER TABLE "ClosureJob" ADD CONSTRAINT "ClosureJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClosureBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
