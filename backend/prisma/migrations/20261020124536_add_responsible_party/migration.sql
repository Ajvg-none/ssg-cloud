-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('TIENDA', 'LABORATORIO');

-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "responsible_party" "ResponsibleParty",
ADD COLUMN     "responsible_source" TEXT;

-- CreateIndex
CREATE INDEX "warranties_responsible_party_idx" ON "warranties"("responsible_party");
