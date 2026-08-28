-- Verso de la pièce d'identité (CNI / titre de séjour) sur le formulaire public.
-- Migration ADDITIVE : une colonne nullable, rien d'autre.

ALTER TABLE "PreEnrollment" ADD COLUMN "cniVersoKey" TEXT;
