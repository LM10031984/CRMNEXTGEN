-- Migration additive seulement : aucun UPDATE, aucun rattachement modifié.
CREATE TYPE "SessionRegime" AS ENUM ('ENTREPRISE', 'INDIVIDUEL');
ALTER TABLE "TrainingSession"
  ADD COLUMN "regime" "SessionRegime",
  ADD COLUMN "priceTotalHT" DECIMAL(10,2);
