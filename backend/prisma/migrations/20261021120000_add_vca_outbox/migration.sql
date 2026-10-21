-- CreateEnum
CREATE TYPE "VcaOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "vca_outbox" (
    "id" TEXT NOT NULL,
    "warranty_id" TEXT NOT NULL,
    "status" "VcaOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vca_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vca_outbox_warranty_id_key" ON "vca_outbox"("warranty_id");

-- CreateIndex
CREATE INDEX "vca_outbox_status_available_at_idx" ON "vca_outbox"("status", "available_at");
