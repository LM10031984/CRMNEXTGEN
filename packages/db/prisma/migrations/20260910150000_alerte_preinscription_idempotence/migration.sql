-- Alerte A-3 (spec §11.1) — le marqueur qui empêche de ré-alerter.
--
-- Même rôle que `Lead.staleAlertedAt` posé par le socle du lot F : le cron
-- repasse toutes les heures, et sans marqueur il annoncerait toutes les heures
-- le même dossier. Une alerte répétée est une alerte qu'on finit par ignorer —
-- et le jour où un vrai dossier arrive, personne ne regarde plus.
--
-- Nullable, donc additive : les pré-inscriptions existantes valent « jamais
-- alertée », ce qui est exact.

-- AlterTable
ALTER TABLE "PreEnrollment" ADD COLUMN     "submissionAlertedAt" TIMESTAMP(3);
