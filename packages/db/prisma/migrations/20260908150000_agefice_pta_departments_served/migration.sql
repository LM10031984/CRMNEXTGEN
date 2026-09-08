-- Quick 260908-m1v — le référentiel des Points d'Accueil AGEFICE est
-- MULTI-DÉPARTEMENTS, ce que le modèle ne savait pas dire.
--
-- `department` (existant) = là où le point d'accueil est physiquement implanté,
-- dérivé de son code postal. C'était jusqu'ici le seul critère de recherche.
-- Or la source officielle (annuaire agefice.fr) publie pour chaque point la
-- LISTE des départements qu'il couvre : 41 des 143 points en servent plusieurs,
-- et surtout **24 départements n'ont aucun point implanté chez eux** (01, 25,
-- 27, 2A, 2B, 37, 38, 39, 41, 43, 52, 68, 69, 71, 73, 74, 79, 90, 91, 92, 93,
-- 94, 95, 976). Pour un apprenant du Rhône ou des Hauts-de-Seine, la recherche
-- par code postal ne renvoyait donc RIEN.
--
-- Migration 100 % ADDITIVE : colonne avec valeur par défaut, l'ancien code
-- continue de fonctionner sans elle.

ALTER TABLE "AgeficePointAccueil"
  ADD COLUMN "departmentsServed" TEXT[] NOT NULL DEFAULT '{}';

-- Recherche « quels points servent le département X » — GIN sur le tableau.
CREATE INDEX "AgeficePointAccueil_departmentsServed_idx"
  ON "AgeficePointAccueil" USING GIN ("departmentsServed");
