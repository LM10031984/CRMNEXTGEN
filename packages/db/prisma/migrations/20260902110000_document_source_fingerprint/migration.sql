-- Lot 0 · 0.2 — empreinte des données d'entrée d'un document (audit produit du
-- 28/08/2026, écart E-1 : « aucune détection de document périmé »).
--
-- Migration 100 % ADDITIVE : une colonne nullable, aucun backfill, aucun index.
-- Les documents déjà produits gardent `sourceFingerprint = NULL`, ce qui vaut
-- « inconnu » et jamais « à jour » — le parc antérieur reste couvert par
-- l'heuristique de dates de la commande /coherence-docs.

ALTER TABLE "Document" ADD COLUMN "sourceFingerprint" TEXT;
