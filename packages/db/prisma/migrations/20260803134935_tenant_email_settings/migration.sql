-- Phase 22 Plan 22-11 D-06 : garde-fou applicatif envois emails — fail-closed.
-- Migration 100 % ADDITIVE (nouvelle table, aucun impact sur l'existant).

-- CreateTable
CREATE TABLE "TenantEmailSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "invoiceRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preinscriptionRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "opcoRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "opcoSubmissionsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "internalNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "userInvitationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "testSessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmailSettings_tenantId_key" ON "TenantEmailSettings"("tenantId");
