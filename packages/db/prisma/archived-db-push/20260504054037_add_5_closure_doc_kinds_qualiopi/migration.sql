-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClosureDocKind" ADD VALUE 'POSITIONNEMENT';
ALTER TYPE "ClosureDocKind" ADD VALUE 'SATISFACTION_CHAUD';
ALTER TYPE "ClosureDocKind" ADD VALUE 'SATISFACTION_FROID';
ALTER TYPE "ClosureDocKind" ADD VALUE 'DEROULE_PEDA';
ALTER TYPE "ClosureDocKind" ADD VALUE 'EMARGEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PedagogicalKind" ADD VALUE 'POSITIONNEMENT';
ALTER TYPE "PedagogicalKind" ADD VALUE 'SATISFACTION_CHAUD';
ALTER TYPE "PedagogicalKind" ADD VALUE 'SATISFACTION_FROID';
ALTER TYPE "PedagogicalKind" ADD VALUE 'EMARGEMENT';
