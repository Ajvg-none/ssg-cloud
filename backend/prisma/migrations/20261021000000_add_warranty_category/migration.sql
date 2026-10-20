-- Categoría de garantía: DÓNDE originó el defecto.
-- Sin downtime: PG 11+ hace ADD COLUMN ... NOT NULL DEFAULT como operación
-- metadato (sin reescritura de tabla) y TODAS las filas existentes nacen
-- 'TIENDA' — no hace falta backfill.
CREATE TYPE "WarrantyCategory" AS ENUM ('TIENDA', 'LABORATORIO');

-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "category" "WarrantyCategory" NOT NULL DEFAULT 'TIENDA';
