-- Compte de service — un `User` qui existe pour une machine, pas pour une personne.
--
-- Motif (11/09/2026) : les alertes internes partaient à TOUS les `User` du
-- tenant, dont `e2e@start-academy.fr` (Playwright) et `admin@startacademy.fr`,
-- qui n'ont pas de boîte. Chaque alerte revenait en deux bounces sur
-- `formation@`, l'expéditeur lui-même.
--
-- Un drapeau distinct de `disabledAt` : le compte E2E doit rester ACTIF pour
-- que Playwright puisse s'y connecter, tout en cessant d'être écrit.
--
-- Strictement additive : colonne booléenne avec défaut `false`, aucune ligne
-- existante n'est modifiée. Le marquage des comptes concernés est fait par un
-- script dédié — une migration ne décide pas de qui est un robot.
ALTER TABLE "User"
  ADD COLUMN "isServiceAccount" BOOLEAN NOT NULL DEFAULT false;
