
-- AlterTable
ALTER TABLE "warranties" DROP COLUMN "responsible_party",
DROP COLUMN "responsible_source";

-- DropEnum
DROP TYPE "ResponsibleParty";

