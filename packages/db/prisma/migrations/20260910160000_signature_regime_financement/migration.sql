-- Spec signature électronique 2026-09-04 §3 bis / décision D-10 — migration ADDITIVE, aucun backfill.
-- « Qui signe quoi » dépend du régime de financement, pas d'un `if` sur le code financeur :
-- la règle vit désormais dans la donnée, sur trois colonnes typées d'`OpcoCatalog`.
-- Les colonnes sont NULLABLES à dessein : `NULL` ne veut pas dire « pas renseigné »
-- mais « pièce HORS RÉGIME » → `NA` dans la matrice, jamais `MISSING`.
-- `OpcoCatalog.requiredDocs` (prose d'affichage) n'est pas touché.

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('DIRIGEANT', 'STAGIAIRE');

-- AlterTable
ALTER TABLE "OpcoCatalog" ADD COLUMN     "ageficeSigner" "SignerRole",
ADD COLUMN     "assiduiteSigner" "SignerRole",
ADD COLUMN     "conventionSigner" "SignerRole";
