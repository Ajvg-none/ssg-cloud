-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "vca_delivered_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "warranties_lab_id_vca_delivered_at_idx" ON "warranties"("lab_id", "vca_delivered_at");
