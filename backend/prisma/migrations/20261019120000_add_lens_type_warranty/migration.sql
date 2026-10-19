-- Garantía "Error de Tipo de Lente (Material)":
-- Caso SAME_ORDER (misma OT, códigos nuevos de montura/cristal) y
-- Caso NEW_ORDER (nueva OT pagada, sin VCA ni ticket, nace COMPLETED).
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "warranty_case" TEXT;
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "new_frame_code" TEXT;
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "new_lens_code" TEXT;
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "new_order_number" TEXT;
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "requires_vca" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "requires_ticket" BOOLEAN NOT NULL DEFAULT true;

-- Defensa adicional: elementos presentes en schema.prisma sin migración previa
-- (idempotente: IF NOT EXISTS soporta BDs donde ya se aplicaron a mano).
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "vca_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "vca_last_error" TEXT;

CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
