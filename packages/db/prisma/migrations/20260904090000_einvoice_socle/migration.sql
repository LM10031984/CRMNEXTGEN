-- Facturation électronique — lot 1, socle de données (spec du 02/09/2026).
--
-- Migration 100 % ADDITIVE : trois enums, quatre tables, neuf colonnes
-- nullables ou à défaut. Aucune donnée existante n'est touchée, aucun montant
-- n'est réécrit — une facture émise ne se modifie pas, on ajoute de la
-- structure autour (code de commerce).
--
-- Pourquoi ces tables : le profil EN 16931 exige des LIGNES de facture, que
-- `Invoice` ne portait pas (montants à plat), et un vendeur / acheteur FIGÉS.
-- Rendre un PDF depuis des données vivantes, c'est l'écart E-1 de l'audit du
-- 28/08 appliqué cette fois à une pièce comptable transmise à l'État.
--
-- `Tenant.einvoiceLastEventId` : curseur de polling. Super PDP n'expose aucun
-- webhook (doc lue le 03/09/2026, OpenAPI 1.30.0.beta) ; la synchronisation
-- passe par `starting_after_id` sur une séquence garantie strictement
-- croissante. Texte et non entier : les ids de la plateforme sont des int64.

-- CreateEnum
CREATE TYPE "InvoicePartyRole" AS ENUM ('SELLER', 'BUYER', 'DELIVERY');

-- CreateEnum
CREATE TYPE "EInvoiceFormat" AS ENUM ('FACTURX', 'UBL', 'CII');

-- CreateEnum
CREATE TYPE "EInvoiceStatus" AS ENUM ('PENDING', 'SUBMITTED', 'DEPOSITED', 'REJECTED_PLATFORM', 'RECEIVED', 'REFUSED_BUYER', 'APPROVED', 'PAID_REPORTED', 'ERROR');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "deliveryAddressJson" JSONB,
ADD COLUMN     "sourceFingerprint" TEXT,
ADD COLUMN     "supplyNature" TEXT NOT NULL DEFAULT 'SERVICES',
ADD COLUMN     "vatOnDebits" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "einvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "einvoiceLastEventId" TEXT,
ADD COLUMN     "einvoiceProvider" TEXT,
ADD COLUMN     "siren" TEXT,
ADD COLUMN     "vatExemptionText" TEXT;

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'C62',
    "unitPriceHT" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "vatCategory" TEXT NOT NULL DEFAULT 'E',
    "vatExemptionReasonCode" TEXT,
    "vatExemptionReasonText" TEXT,
    "participantId" TEXT,
    "totalHT" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceParty" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "role" "InvoicePartyRole" NOT NULL,
    "legalName" TEXT NOT NULL,
    "siren" TEXT,
    "siret" TEXT,
    "vatNumber" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'FR',
    "email" TEXT,
    "electronicAddressScheme" TEXT,
    "electronicAddress" TEXT,

    CONSTRAINT "InvoiceParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoiceTransmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "format" "EInvoiceFormat" NOT NULL,
    "profile" TEXT NOT NULL DEFAULT 'EN16931',
    "xmlStorageKey" TEXT NOT NULL,
    "pdfStorageKey" TEXT,
    "xmlSha256" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "EInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "statusDetail" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceTransmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoiceEvent" (
    "id" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    "status" "EInvoiceStatus" NOT NULL,
    "payload" JSONB,
    "providerCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EInvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_position_idx" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceParty_invoiceId_role_key" ON "InvoiceParty"("invoiceId", "role");

-- CreateIndex
CREATE INDEX "EInvoiceTransmission_tenantId_status_idx" ON "EInvoiceTransmission"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EInvoiceTransmission_invoiceId_idx" ON "EInvoiceTransmission"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceTransmission_invoiceId_xmlSha256_key" ON "EInvoiceTransmission"("invoiceId", "xmlSha256");

-- CreateIndex
CREATE INDEX "EInvoiceEvent_transmissionId_occurredAt_idx" ON "EInvoiceEvent"("transmissionId", "occurredAt");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceParty" ADD CONSTRAINT "InvoiceParty_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceTransmission" ADD CONSTRAINT "EInvoiceTransmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceEvent" ADD CONSTRAINT "EInvoiceEvent_transmissionId_fkey" FOREIGN KEY ("transmissionId") REFERENCES "EInvoiceTransmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

