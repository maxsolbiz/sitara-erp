-- Tenant-scoped barcode uniqueness (Phase 2B): barcodes were globally
-- unique, so one tenant could squat (or honestly collide on shared
-- supplier barcodes with) another tenant's barcode. Matches every other
-- identifier in the schema (username, email, sku, customerCode).
-- Pre-migration safety queries (all three returned zero rows on prod):
--   SELECT barcode, COUNT(DISTINCT tenant_id) FROM <products|barcodes|customers>
--   WHERE barcode IS NOT NULL GROUP BY barcode HAVING COUNT(DISTINCT tenant_id) > 1;
-- NULL handling: Postgres treats NULLs as distinct in unique indexes, so
-- multiple NULL barcodes per tenant remain allowed — same as before.

-- DropIndex
DROP INDEX "barcodes_barcode_key";

-- DropIndex
DROP INDEX "customers_barcode_key";

-- DropIndex
DROP INDEX "products_barcode_key";

-- CreateIndex
CREATE UNIQUE INDEX "barcodes_tenant_id_barcode_key" ON "barcodes"("tenant_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_barcode_key" ON "customers"("tenant_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_barcode_key" ON "products"("tenant_id", "barcode");
