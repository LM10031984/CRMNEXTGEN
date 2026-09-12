-- CreateTable
CREATE TABLE "SignatureWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signerKey" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureWebhookEvent_tenantId_receivedAt_idx" ON "SignatureWebhookEvent"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureWebhookEvent_providerId_eventType_signerKey_key" ON "SignatureWebhookEvent"("providerId", "eventType", "signerKey");
