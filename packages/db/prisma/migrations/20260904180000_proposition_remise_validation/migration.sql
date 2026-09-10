-- Chaîne diagnostic — lot E (proposition), spec §8.3 et D-3.
--
-- Une remise au-delà de `DISCOUNT_WARNING_PERCENT` % du reste à charge exige la
-- validation d'un MANAGER/ADMIN, et bloque l'envoi tant qu'elle n'est pas
-- accordée. La validation est un FAIT EN BASE, écrit par une action dédiée —
-- pas un drapeau dans `pricingJson`, que la saisie du commercial pourrait
-- poser elle-même en passant.
--
-- Strictement additive : deux colonnes nullables sur une table introduite par
-- la migration `20260902170000_chaine_diagnostic_socle`, jamais peuplée en
-- production à ce jour.

ALTER TABLE "Proposal" ADD COLUMN "discountApprovedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN "discountApprovedById" TEXT;
