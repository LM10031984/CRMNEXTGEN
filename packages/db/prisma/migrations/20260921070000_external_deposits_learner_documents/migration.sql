ALTER TABLE "OpcoSubmission" ADD COLUMN "deliveryMethod" TEXT NOT NULL DEFAULT 'EMAIL', ADD COLUMN "externalSender" TEXT;
ALTER TABLE "TenantEmailSettings" ADD COLUMN "learnerDocumentsEnabled" BOOLEAN NOT NULL DEFAULT false;
-- Preserve the existing permission for these explicit sends; new tenants remain off by default.
UPDATE "TenantEmailSettings" SET "learnerDocumentsEnabled" = "opcoSubmissionsEnabled";
