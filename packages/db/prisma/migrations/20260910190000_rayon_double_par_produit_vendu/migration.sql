-- D-19 bis (arbitrage Laurent du 10/09/2026) — la version VENDUE fait foi.
--
-- L'import du Drive a créé quatre rayons qui font doublon avec des produits
-- réellement vendus (drive:055 ↔ PROD-055, drive:053 ↔ PROD-053,
-- drive:046 ↔ PROD-0671, drive:074 ↔ PROD-0662). Le produit vendu ne bouge pas
-- — ni sa durée, ni sa page publique « Programme détaillé », qui EST
-- l'information préalable remise au client. C'est donc le RAYON qui s'efface :
-- ses modules sortent du chemin de composition.
--
-- Motif : composer une proposition depuis la version Drive reviendrait à bâtir
-- un parcours sur un contenu qui n'est pas celui que la convention annonce.
-- Deux versions du même programme dans la bibliothèque, c'est une occasion de
-- vendre l'une et d'animer l'autre.
--
-- Le lien est posé une fois et ne se défait jamais tout seul : un prochain
-- import qui ne reconnaîtrait plus le doublon (dossier Drive renommé) ne peut
-- pas le réintroduire. Le délier est une décision de catalogue, pas un effet de
-- bord d'un script.
--
-- Additif et réversible : une colonne nullable, aucune reprise de données.
-- `ON DELETE SET NULL` : supprimer un produit vendu délie ses rayons au lieu de
-- les emporter — la bibliothèque survit à un ménage du catalogue commercial.

-- AlterTable
ALTER TABLE "TrainingProduct" ADD COLUMN     "supersededByProductId" TEXT;

-- CreateIndex
CREATE INDEX "TrainingProduct_supersededByProductId_idx" ON "TrainingProduct"("supersededByProductId");

-- AddForeignKey
ALTER TABLE "TrainingProduct" ADD CONSTRAINT "TrainingProduct_supersededByProductId_fkey" FOREIGN KEY ("supersededByProductId") REFERENCES "TrainingProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
