/*
  Warnings:

  - A unique constraint covering the columns `[order_number,revision]` on the table `warranties` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "warranties_order_number_revision_key" ON "warranties"("order_number", "revision");
