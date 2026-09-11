-- D-19 (lot I-1) — le catalogue devient une BIBLIOTHÈQUE DE MODULES.
--
-- Le module est promu unité recommandable : c'est lui que la recommandation
-- retient, et la proposition devra pouvoir dire de quel programme source il
-- vient. `sourceRef` porte cette identité stable — `drive:058#3`,
-- `diag:mod-chatgpt-conseiller`, `faros:parcours` — là où l'`id` technique ne
-- survit pas à une recréation et où le titre peut être corrigé à la main.
--
-- Deux usages, et deux seulement :
--   • rejouer un import sans créer de doublon (on retrouve un rayon par sa
--     source, jamais par son titre) ;
--   • dire dans un rapport d'où sort un module retenu.
--
-- Ce n'est PAS un critère de vente. Corollaire D-19 du 10/09/2026 : les rayons
-- importés ne sont jamais activés, c'est le programme COMPOSÉ (lot I-2) qui
-- porte l'état vendable.
--
-- Additif et réversible : deux colonnes nullables, aucune reprise de données.
-- L'unicité sur `(tenantId, sourceRef)` tolère autant de NULL qu'on veut
-- (règle Postgres), donc les produits saisis à la main ne sont pas contraints.

-- AlterTable
ALTER TABLE "TrainingProduct" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "TrainingModule" ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProduct_tenantId_sourceRef_key" ON "TrainingProduct"("tenantId", "sourceRef");

-- CreateIndex
CREATE INDEX "TrainingModule_sourceRef_idx" ON "TrainingModule"("sourceRef");
