-- Lot 0 · 0.2 — tracer les documents partis en pièce jointe.
--
-- Le trou fermé ici : un document « envoyé mais pas encore signé ». Rien dans
-- l'application ne disait qu'un PDF avait quitté la maison, donc la
-- régénération d'une convention déjà partie chez un financeur passait
-- inaperçue. `EmailMessage.documentIds` porte les ids des `Document` joints à
-- un envoi réel ; un document qui y figure compte comme ENGAGÉ.
--
-- Migration 100 % ADDITIVE (colonne nullable + un index de listing).
-- Les envois antérieurs à cette date n'ont aucune ligne : ils restent
-- couverts par l'avertissement « ce document a pu être envoyé ».

ALTER TABLE "EmailMessage" ADD COLUMN "documentIds" JSONB;

CREATE INDEX "EmailMessage_tenantId_sentAt_idx" ON "EmailMessage"("tenantId", "sentAt");
