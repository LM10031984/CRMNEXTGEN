-- BUG-15 — Documents légaux statiques tenant (CGV, règlement intérieur).
-- Stockés en markdown éditable côté Paramètres, rendus en PDF via marked.
ALTER TABLE "Tenant" ADD COLUMN "cgvMarkdown" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "reglementInterieurMarkdown" TEXT;

-- Extension de l'enum DocType pour permettre de stocker les PDF générés
-- dans Document avec type=CGV ou type=REGLEMENT_INTERIEUR.
ALTER TYPE "DocType" ADD VALUE IF NOT EXISTS 'CGV';
ALTER TYPE "DocType" ADD VALUE IF NOT EXISTS 'REGLEMENT_INTERIEUR';
