-- AlterTable: hébergement formateur + accessibilité PSH (Check List C4.i17)
ALTER TABLE "TrainingSession"
  ADD COLUMN "needsTrainerLodging" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trainerLodgingPlace" TEXT,
  ADD COLUMN "trainerLodgingDates" TEXT,
  ADD COLUMN "hasDisabledLearner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "disabilityAdaptations" TEXT;
