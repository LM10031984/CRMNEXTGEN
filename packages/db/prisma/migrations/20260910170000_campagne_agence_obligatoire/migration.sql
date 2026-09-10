-- D-22 — une campagne de pré-inscription porte TOUJOURS une agence.
--
-- `organizationId` devient le rattachement canonique et OBLIGATOIRE ; le
-- diagnostic et le lead restent facultatifs, en contexte supplémentaire. Motif :
-- un rattachement unique évite d'avoir à deviner, dans chaque écran et à la
-- conversion des pré-inscriptions, lequel de trois liens facultatifs a été
-- renseigné.
--
-- Aucune reprise de données : la campagne de RDV n'a jamais tourné en
-- production. Les lignes éventuelles sont des essais locaux ou d'aperçu, et
-- elles n'ont aucune agence à qui être rattachées — d'où la purge ci-dessous,
-- qui est la seule façon d'ajouter une colonne NOT NULL sans défaut inventé.
-- Le `ON DELETE CASCADE` de `BatchDateOption` emporte les dates avec elles ;
-- les `PreEnrollment` liés, eux, se détachent (`batchId` est nullable) et
-- restent visibles dans le pipeline de pré-inscriptions.

ALTER TABLE "EnrollmentBatch" ADD COLUMN "leadId" TEXT;
ALTER TABLE "EnrollmentBatch" ADD COLUMN "organizationId" TEXT;

UPDATE "PreEnrollment" SET "batchId" = NULL
 WHERE "batchId" IN (SELECT "id" FROM "EnrollmentBatch" WHERE "organizationId" IS NULL);

DELETE FROM "EnrollmentBatch" WHERE "organizationId" IS NULL;

ALTER TABLE "EnrollmentBatch" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "EnrollmentBatch_organizationId_idx" ON "EnrollmentBatch"("organizationId");

-- CreateIndex
CREATE INDEX "EnrollmentBatch_leadId_idx" ON "EnrollmentBatch"("leadId");

-- AddForeignKey
ALTER TABLE "EnrollmentBatch" ADD CONSTRAINT "EnrollmentBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentBatch" ADD CONSTRAINT "EnrollmentBatch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
