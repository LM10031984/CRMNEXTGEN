-- Chaîne diagnostic — lot F (campagne RDV + alertes §11.1).
--
-- Strictement additive : trois colonnes nullables ou à défaut `false`.
--
-- `Lead.staleAlertedAt` n'existe que pour l'idempotence de l'alerte A-2 :
-- UNE alerte par lead délaissé, jamais un rappel à chaque passage du cron.
-- Elle est remise à NULL dès qu'une action est enregistrée sur le lead, pour
-- qu'un lead re-délaissé puisse ré-alerter.
--
-- Les deux catégories d'email suivent la doctrine fail-closed du reste de la
-- table : `false` par défaut, donc rien ne part tant que Laurent n'a pas coché.

ALTER TABLE "Lead" ADD COLUMN "staleAlertedAt" TIMESTAMP(3);

ALTER TABLE "TenantEmailSettings" ADD COLUMN "newLeadAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantEmailSettings" ADD COLUMN "preEnrollmentAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;
