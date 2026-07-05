-- AlterEnum
-- Add 3 DocType values for Phase A/B/C refactor (05/05/2026):
--   DEROULE_PEDAGOGIQUE : asset partagé au niveau produit
--   CHECKLIST_FORMATION : 1 par session (C4.i17 Qualiopi)
--   GRILLE_OBS_SESSION  : 1 par session, consolidée formateur (C3.i11 Qualiopi)
ALTER TYPE "DocType" ADD VALUE IF NOT EXISTS 'DEROULE_PEDAGOGIQUE';
ALTER TYPE "DocType" ADD VALUE IF NOT EXISTS 'CHECKLIST_FORMATION';
ALTER TYPE "DocType" ADD VALUE IF NOT EXISTS 'GRILLE_OBS_SESSION';
