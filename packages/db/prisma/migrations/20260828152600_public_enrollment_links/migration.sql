-- Inscriptions publiques par session (spec 2026-08-28).
-- Migration 100 % ADDITIVE : uniquement des colonnes nullables et deux index.
-- Aucune donnée existante n'est touchée, aucun DROP, aucun DEFAULT à backfiller.

-- AlterTable : lien public porté par la session de formation.
--   publicToken NULL          = session jamais ouverte aux inscriptions
--   publicFormClosedAt NOT NULL = inscriptions fermées
ALTER TABLE "TrainingSession"
  ADD COLUMN "publicToken" TEXT,
  ADD COLUMN "publicFormOpenedAt" TIMESTAMP(3),
  ADD COLUMN "publicFormClosedAt" TIMESTAMP(3);

-- AlterTable : champs saisis au formulaire public.
-- Le n° de sécurité sociale n'y figure PAS : il est écrit directement dans
-- SensitiveData à la validation (minimisation RGPD, spec §4.2).
ALTER TABLE "PreEnrollment"
  ADD COLUMN "birthName" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "companySiret" TEXT,
  ADD COLUMN "managerSince" TEXT;

-- CreateIndex : un jeton identifie une seule session.
CREATE UNIQUE INDEX "TrainingSession_publicToken_key" ON "TrainingSession"("publicToken");

-- CreateIndex : liste des demandes d'une session, filtrée par statut.
CREATE INDEX "PreEnrollment_intendedSessionId_status_idx" ON "PreEnrollment"("intendedSessionId", "status");
