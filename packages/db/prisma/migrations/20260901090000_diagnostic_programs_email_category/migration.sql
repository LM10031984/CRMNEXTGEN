-- Quick 260901-qr7 : catégorie d'email « programme du diagnostic » (stand MLS).
-- Migration 100 % ADDITIVE : une colonne booléenne avec défaut `false`.
--
-- Le défaut `false` n'est pas un détail : le garde-fou du plan 22-11 est
-- fail-closed. Tant que Laurent n'a pas coché la case dans Paramètres → Emails,
-- aucun programme ne part, même si le diagnostic tourne et que les leads
-- s'enregistrent.

ALTER TABLE "TenantEmailSettings"
  ADD COLUMN "diagnosticProgramsEnabled" BOOLEAN NOT NULL DEFAULT false;
