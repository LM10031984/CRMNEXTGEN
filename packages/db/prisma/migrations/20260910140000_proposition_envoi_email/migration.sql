-- D-21 (10/09/2026) — l'envoi de la proposition par email au client.
--
-- Additive et fail-closed : la colonne naît à false, donc l'existant ne change
-- pas de comportement et aucun email ne part tant qu'un ADMIN n'a pas coché la
-- case dans Paramètres. C'est la règle de toutes les catégories d'envoi depuis
-- la Phase 22 — une catégorie qu'on n'a pas cochée n'envoie rien.

-- AlterTable
ALTER TABLE "TenantEmailSettings" ADD COLUMN     "proposalSendEnabled" BOOLEAN NOT NULL DEFAULT false;
