-- AlterTable
ALTER TABLE "AgeficeProfile" ADD COLUMN     "pointAccueilId" TEXT,
ADD COLUMN     "pointAccueilLockedManually" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgeficePointAccueil" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address1" TEXT,
    "address2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "departmentName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "source" TEXT NOT NULL DEFAULT 'agefice.fr-2025',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgeficePointAccueil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgeficePointAccueil_department_idx" ON "AgeficePointAccueil"("department");

-- CreateIndex
CREATE INDEX "AgeficePointAccueil_city_idx" ON "AgeficePointAccueil"("city");

-- CreateIndex
CREATE UNIQUE INDEX "AgeficePointAccueil_postalCode_name_key" ON "AgeficePointAccueil"("postalCode", "name");

-- AddForeignKey
ALTER TABLE "AgeficeProfile" ADD CONSTRAINT "AgeficeProfile_pointAccueilId_fkey" FOREIGN KEY ("pointAccueilId") REFERENCES "AgeficePointAccueil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
