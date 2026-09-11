-- D-19 (lot I-2) — le programme COMPOSÉ devient le produit vendu à ce client.
--
-- Jusqu'ici une proposition désignait des produits du catalogue. Depuis D-19,
-- elle assemble des modules venus de plusieurs programmes, et cet assemblage
-- EST l'offre : c'est lui qui portera la convention, le programme Qualiopi et
-- les sessions du lot G. Il lui faut donc une existence en base, et un lien
-- depuis la proposition qui l'a produit.
--
-- Le produit composé naît ACTIF, contrairement aux rayons de la bibliothèque
-- (corollaire D-19 du 10/09) : un rayon est une étagère, un produit composé est
-- une offre réelle, vendue à une agence nommée.
--
-- `ON DELETE SET NULL` : supprimer un produit ne doit pas emporter la
-- proposition qui l'a vendu — la trace commerciale survit au ménage du
-- catalogue, et la proposition reste lisible telle qu'elle a été envoyée.
--
-- Additif et réversible : une colonne nullable, aucune reprise de données.

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "composedProductId" TEXT;

-- CreateIndex
CREATE INDEX "Proposal_composedProductId_idx" ON "Proposal"("composedProductId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_composedProductId_fkey" FOREIGN KEY ("composedProductId") REFERENCES "TrainingProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
