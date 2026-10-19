-- AlterTable
ALTER TABLE "labs" ADD COLUMN     "poll_interval" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "print_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "printer_name" TEXT NOT NULL DEFAULT 'Bixolon',
ADD COLUMN     "vca_enabled" BOOLEAN NOT NULL DEFAULT true;
