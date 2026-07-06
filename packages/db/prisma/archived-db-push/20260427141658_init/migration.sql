-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'FORMATEUR', 'COMMERCIAL', 'COMPTABLE', 'LECTEUR');

-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('SAS', 'SARL', 'SASU', 'EURL', 'SA', 'EI', 'EIRL', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'PARTICULIER', 'AUTRE');

-- CreateEnum
CREATE TYPE "LinkRole" AS ENUM ('DIRIGEANT', 'SALARIE', 'EI_SELF', 'ALTERNANT', 'STAGIAIRE', 'CONTACT', 'FINANCEUR_CONTACT', 'FORMATEUR');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('PRESENTIEL', 'DISTANCIEL', 'MIXTE', 'ELEARNING');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PRE_ENROLLED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "FinancingMode" AS ENUM ('OPCO', 'CPF', 'ENTREPRISE', 'AUTOFINANCEMENT', 'POLE_EMPLOI', 'AUTRE');

-- CreateEnum
CREATE TYPE "FinancingStatus" AS ENUM ('NOT_STARTED', 'REQUESTED', 'PRE_APPROVED', 'APPROVED', 'REJECTED', 'REIMBURSED');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('STRUCTURE', 'PERSONNE', 'OPCO_DIRECT', 'CPF');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD', 'TO_FOLLOWUP');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('CONVENTION', 'PROGRAMME', 'CONVOCATION', 'EMARGEMENT', 'ASSIDUITE', 'ATTESTATION_FIN', 'CERTIFICAT_REALISATION', 'AGEFICE', 'EVALUATION_ACQUIS', 'SATISFACTION', 'SUPPORT_PEDAGOGIQUE', 'PRE_ACCORD_OPCO', 'VALIDATION_OPCO', 'FACTURE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OpcoStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DOING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PedagogicalKind" AS ENUM ('ANALYSE_BESOIN', 'QCM', 'GRILLE_OBS', 'COMPETENCES', 'DEROULE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT,
    "numDA" TEXT,
    "rcs" TEXT,
    "address" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPwd" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LECTEUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "civility" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthName" TEXT,
    "birthDate" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "personalAddress" JSONB,
    "educationLevel" TEXT,
    "diplomas" TEXT,
    "professionalExperience" TEXT,
    "professionalStatus" TEXT,
    "bpfDefaultStatus" TEXT,
    "rgpdConsentAt" TIMESTAMP(3),
    "requiresCleanup" BOOLEAN NOT NULL DEFAULT false,
    "cleanupNotes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensitiveData" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "socialSecurityNb" TEXT,
    "idDocumentUrl" TEXT,
    "idDocumentType" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitiveData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "legalForm" "LegalForm" NOT NULL,
    "siren" TEXT,
    "siret" TEXT,
    "naf" TEXT,
    "vatNumber" TEXT,
    "address" JSONB,
    "phone" TEXT,
    "email" TEXT,
    "emailBilling" TEXT,
    "phoneBilling" TEXT,
    "opcoCode" TEXT,
    "opcoCatalogId" TEXT,
    "network" TEXT,
    "brandName" TEXT,
    "representative" TEXT,
    "activityDescription" TEXT,
    "rcs" TEXT,
    "type" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "requiresCleanup" BOOLEAN NOT NULL DEFAULT false,
    "cleanupNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalLink" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "LinkRole" NOT NULL,
    "function" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "function" TEXT,
    "isBillingContact" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT,
    "invoiceName" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "legalMentions" TEXT,
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "modality" "Modality" NOT NULL,
    "prerequisites" TEXT,
    "targetAudience" TEXT,
    "objectives" JSONB NOT NULL,
    "programMd" TEXT NOT NULL,
    "pedagogicalMethods" TEXT,
    "evaluationMethods" TEXT,
    "accessibility" TEXT,
    "trainerProfile" TEXT,
    "pedagogicalSupport" TEXT,
    "accessConditions" TEXT,
    "priceHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "groupFlatPrice" DECIMAL(10,2),
    "theme" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "excludedFromBpf" BOOLEAN NOT NULL DEFAULT false,
    "bpfSpecialty" TEXT,
    "bpfCategory" TEXT,
    "bpfLevel" TEXT,
    "capacityMin" INTEGER NOT NULL DEFAULT 1,
    "capacityMax" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "presentielIndividualHours" INTEGER,
    "presentielCollectifHours" INTEGER,
    "distancielSyncHours" INTEGER,
    "distancielAsyncHours" INTEGER,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT,
    "modality" "Modality" NOT NULL,
    "capacityMin" INTEGER NOT NULL DEFAULT 1,
    "capacityMax" INTEGER NOT NULL DEFAULT 12,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "internalNotes" TEXT,
    "pricePerLearner" DECIMAL(10,2),
    "preEnrollmentsFromMls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "capacity" INTEGER,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTrainer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "dailyRate" DECIMAL(10,2),

    CONSTRAINT "SessionTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSlot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "halfDay" TEXT NOT NULL,

    CONSTRAINT "SessionSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAvailability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sponsorOrgId" TEXT NOT NULL,
    "billingProfileId" TEXT,
    "priceHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountCollected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountRemaining" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "enrollmentStatus" "EnrollmentStatus" NOT NULL DEFAULT 'PRE_ENROLLED',
    "bpfStatus" TEXT,
    "participantType" TEXT,
    "payerOrgId" TEXT,
    "payerContactId" TEXT,
    "financingMode" "FinancingMode",
    "financingStatus" "FinancingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "financingRefNumber" TEXT,
    "financingRequestDate" TIMESTAMP(3),
    "financingApprovalDate" TIMESTAMP(3),
    "billingType" "BillingType",
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "conventionSigned" BOOLEAN NOT NULL DEFAULT false,
    "programmeDelivered" BOOLEAN NOT NULL DEFAULT false,
    "certificateDelivered" BOOLEAN NOT NULL DEFAULT false,
    "pedagogicalSupportsGiven" BOOLEAN NOT NULL DEFAULT false,
    "attendanceSheetCollected" BOOLEAN NOT NULL DEFAULT false,
    "assiduitySheetCollected" BOOLEAN NOT NULL DEFAULT false,
    "evaluationCollected" BOOLEAN NOT NULL DEFAULT false,
    "satisfactionCollected" BOOLEAN NOT NULL DEFAULT false,
    "closingDocsSent" BOOLEAN NOT NULL DEFAULT false,
    "invoiceSent" BOOLEAN NOT NULL DEFAULT false,
    "paymentReceived" BOOLEAN NOT NULL DEFAULT false,
    "opcoPreApproved" BOOLEAN NOT NULL DEFAULT false,
    "opcoApproved" BOOLEAN NOT NULL DEFAULT false,
    "opcoReimbursed" BOOLEAN NOT NULL DEFAULT false,
    "payerErrorMessage" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "signatureUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "ip" TEXT,
    "qrToken" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "personId" TEXT,
    "organizationId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "interestedProductId" TEXT,
    "desiredSessionId" TEXT,
    "ownerUserId" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "lastAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "reminderTemplate" TEXT,
    "validatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAction" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "participantId" TEXT,
    "payerOrgId" TEXT,
    "payerContactId" TEXT,
    "billingProfileId" TEXT,
    "amountHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amountTTC" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "hashSha256" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualiopiDocCatalog" (
    "id" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "name" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "qualiopiIndicator" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "recommendedDelay" TEXT,
    "responsible" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualiopiDocCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "type" "DocType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "sessionId" TEXT,
    "participantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyMjml" TEXT NOT NULL,
    "variables" JSONB NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "toEmails" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "relatedEntity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcoCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "website" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactAddress" TEXT,
    "averageDelayDays" INTEGER,
    "maxAmountPerTraining" DECIMAL(10,2),
    "yearlyCapPerPerson" DECIMAL(10,2),
    "conditions" TEXT,
    "requiredDocs" JSONB,
    "adminContact" TEXT,
    "status" "OpcoStatus" NOT NULL DEFAULT 'ACTIVE',
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpcoCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "sessionId" TEXT,
    "leadId" TEXT,
    "participantId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "sessionId" TEXT,
    "leadId" TEXT,
    "personId" TEXT,
    "organizationId" TEXT,
    "participantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgeficeProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paName" TEXT,
    "paNumber" TEXT,
    "paContact" TEXT,
    "paAddress" JSONB,
    "paFields" JSONB NOT NULL,
    "pdfTemplateVersion" TEXT NOT NULL DEFAULT '2023-2024',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeficeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedagogicalAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "PedagogicalKind" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT,
    "rawJson" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "hashSha256" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedagogicalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGenerationJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "errorMsg" TEXT,
    "refTable" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "Person_tenantId_lastName_firstName_idx" ON "Person"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Person_tenantId_email_idx" ON "Person"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "SensitiveData_personId_key" ON "SensitiveData"("personId");

-- CreateIndex
CREATE INDEX "Organization_tenantId_legalName_idx" ON "Organization"("tenantId", "legalName");

-- CreateIndex
CREATE INDEX "Organization_tenantId_siren_idx" ON "Organization"("tenantId", "siren");

-- CreateIndex
CREATE INDEX "Organization_tenantId_siret_idx" ON "Organization"("tenantId", "siret");

-- CreateIndex
CREATE INDEX "LegalLink_organizationId_idx" ON "LegalLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalLink_personId_organizationId_role_key" ON "LegalLink"("personId", "organizationId", "role");

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE INDEX "BillingProfile_tenantId_idx" ON "BillingProfile"("tenantId");

-- CreateIndex
CREATE INDEX "TrainingProduct_tenantId_isActive_idx" ON "TrainingProduct"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProduct_tenantId_code_key" ON "TrainingProduct"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TrainingModule_productId_order_idx" ON "TrainingModule"("productId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_code_key" ON "TrainingSession"("code");

-- CreateIndex
CREATE INDEX "TrainingSession_tenantId_status_idx" ON "TrainingSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TrainingSession_tenantId_startDate_idx" ON "TrainingSession"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTrainer_sessionId_personId_key" ON "SessionTrainer"("sessionId", "personId");

-- CreateIndex
CREATE INDEX "SessionSlot_sessionId_date_idx" ON "SessionSlot"("sessionId", "date");

-- CreateIndex
CREATE INDEX "TrainerAvailability_tenantId_trainerId_startsAt_idx" ON "TrainerAvailability"("tenantId", "trainerId", "startsAt");

-- CreateIndex
CREATE INDEX "SessionParticipant_sponsorOrgId_idx" ON "SessionParticipant"("sponsorOrgId");

-- CreateIndex
CREATE INDEX "SessionParticipant_financingStatus_idx" ON "SessionParticipant"("financingStatus");

-- CreateIndex
CREATE INDEX "SessionParticipant_paymentStatus_idx" ON "SessionParticipant"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipant_sessionId_personId_key" ON "SessionParticipant"("sessionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_qrToken_key" ON "Attendance"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_slotId_personId_key" ON "Attendance"("slotId", "personId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lead_tenantId_ownerUserId_idx" ON "Lead"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "LeadAction_leadId_occurredAt_idx" ON "LeadAction"("leadId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_issueDate_idx" ON "Invoice"("tenantId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "QualiopiDocCatalog_type_key" ON "QualiopiDocCatalog"("type");

-- CreateIndex
CREATE INDEX "Document_tenantId_entityType_entityId_idx" ON "Document"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_tenantId_type_idx" ON "Document"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_code_key" ON "EmailTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpcoCatalog_code_key" ON "OpcoCatalog"("code");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_dueDate_idx" ON "Task"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "InternalComment_tenantId_createdAt_idx" ON "InternalComment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgeficeProfile_organizationId_key" ON "AgeficeProfile"("organizationId");

-- CreateIndex
CREATE INDEX "PedagogicalAsset_tenantId_kind_idx" ON "PedagogicalAsset"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalAsset_sessionId_participantId_kind_key" ON "PedagogicalAsset"("sessionId", "participantId", "kind");

-- CreateIndex
CREATE INDEX "AIGenerationJob_tenantId_status_idx" ON "AIGenerationJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AIGenerationJob_refTable_refId_idx" ON "AIGenerationJob"("refTable", "refId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_tenantId_entityType_entityId_idx" ON "ExternalIdentity"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_source_externalId_key" ON "ExternalIdentity"("source", "externalId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensitiveData" ADD CONSTRAINT "SensitiveData_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_opcoCatalogId_fkey" FOREIGN KEY ("opcoCatalogId") REFERENCES "OpcoCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalLink" ADD CONSTRAINT "LegalLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalLink" ADD CONSTRAINT "LegalLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingModule" ADD CONSTRAINT "TrainingModule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TrainingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTrainer" ADD CONSTRAINT "SessionTrainer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTrainer" ADD CONSTRAINT "SessionTrainer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSlot" ADD CONSTRAINT "SessionSlot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAvailability" ADD CONSTRAINT "TrainerAvailability_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_sponsorOrgId_fkey" FOREIGN KEY ("sponsorOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "SessionSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestedProductId_fkey" FOREIGN KEY ("interestedProductId") REFERENCES "TrainingProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_desiredSessionId_fkey" FOREIGN KEY ("desiredSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payerOrgId_fkey" FOREIGN KEY ("payerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalComment" ADD CONSTRAINT "InternalComment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalComment" ADD CONSTRAINT "InternalComment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalComment" ADD CONSTRAINT "InternalComment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalComment" ADD CONSTRAINT "InternalComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalComment" ADD CONSTRAINT "InternalComment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgeficeProfile" ADD CONSTRAINT "AgeficeProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalAsset" ADD CONSTRAINT "PedagogicalAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
