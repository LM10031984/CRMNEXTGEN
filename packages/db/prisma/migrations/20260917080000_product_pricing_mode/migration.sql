-- Le mode de prix devient une propriété du PRODUIT (arbitrage Laurent, 16/09/2026).
--
-- Jusqu'ici, « prix par tête » ou « total entreprise » se déduisait de la
-- COMPOSITION de la session au moment de générer le programme. Un produit vendu
-- au forfait à une entreprise (88 h) et un produit vendu à la place à des
-- indépendants (72 h à 3 024 €) étaient indiscernables au catalogue : le
-- programme produit annonçait « par stagiaire » dans les deux cas.
--
-- Cette migration ne fait que POSER la donnée. Aucun code ne la lit encore :
-- elle est volontairement inerte, pour être déployée seule et sans effet.

-- CreateEnum
CREATE TYPE "ProductPricingMode" AS ENUM ('PAR_STAGIAIRE', 'FORFAIT_ENTREPRISE');

-- AlterTable
ALTER TABLE "TrainingProduct" ADD COLUMN     "pricingMode" "ProductPricingMode" NOT NULL DEFAULT 'PAR_STAGIAIRE';

-- Rétro-remplissage · liste arrêtée par Laurent le 16/09/2026, sur le régime
-- RÉELLEMENT observé session par session (100 % des inscrits sous une seule
-- convention d'entreprise) et non sur le titre du produit.
--
-- Le défaut `PAR_STAGIAIRE` couvre tout le reste, y compris les produits au
-- régime « mélangé » — vendus aux deux populations. Leur cas ne se règle pas
-- par un mode mais en les SCINDANT en deux produits, ce qui est une décision
-- commerciale et pas une migration.
--
-- Note : le filtre porte sur `code`, unique par tenant et non globalement. Sur
-- un déploiement multi-tenant il faudrait le scoper ; le dépôt est
-- mono-tenant en production, et sur les bases de développement ces codes
-- n'existent pas — l'UPDATE y touche alors zéro ligne, ce qui est correct.
UPDATE "TrainingProduct"
   SET "pricingMode" = 'FORFAIT_ENTREPRISE'
 WHERE "code" IN ('PROD-cdd22466', 'PROD-0674', 'PROD-0662', 'PROD-0667', 'PROD-0668');

-- `groupFlatPrice` devient obsolète : un seul montant sur le produit, `priceHT`,
-- que le mode dit comment lire (cf. `docs/deferred.md` § D-2, qui porte la
-- suppression de la colonne — DESTRUCTIVE, donc pas ici).
--
-- Relevé du 16/09 sur la production : la colonne n'est renseignée que sur deux
-- produits, et elle y vaut EXACTEMENT `priceHT`. Cet UPDATE porte donc sur zéro
-- ligne aujourd'hui. Il est écrit quand même : si un forfait divergeait d'ici à
-- l'application de la migration, c'est lui qui ferait foi, et le silence aurait
-- laissé passer un prix faux.
UPDATE "TrainingProduct"
   SET "priceHT" = "groupFlatPrice"
 WHERE "pricingMode" = 'FORFAIT_ENTREPRISE'
   AND "groupFlatPrice" IS NOT NULL
   AND "groupFlatPrice" <> "priceHT";
