-- D-19 ter (relecture du 11/09/2026) — un programme NON DIFFUSABLE ne sort jamais,
-- ni comme produit, ni par ses modules.
--
-- Strictement additive : colonne booléenne avec défaut `false`, aucune ligne
-- existante n'est modifiée. Le marquage du parcours « L'Agent Incomparable »
-- est fait par l'import (`import:diag-catalog`), pas ici — une migration ne
-- décide pas d'un contenu de catalogue.
ALTER TABLE "TrainingProduct"
  ADD COLUMN "excludedFromClientOutputs" BOOLEAN NOT NULL DEFAULT false;
