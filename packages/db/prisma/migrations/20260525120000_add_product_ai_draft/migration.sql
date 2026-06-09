-- BUG-P0-02 — flag d'horodatage du draft IA sur TrainingProduct.
-- Null = produit validé (ou créé manuellement, état par défaut).
-- Non-null = brouillon IA en attente de revue humaine.
ALTER TABLE "TrainingProduct" ADD COLUMN "aiDraftedAt" TIMESTAMP(3);
