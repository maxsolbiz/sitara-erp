-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "pricing_tier_id" BIGINT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "tier_discount" DECIMAL(5,2),
ADD COLUMN     "tier_id" BIGINT,
ADD COLUMN     "tier_name" VARCHAR(100);

-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_tiers_tenant_id_idx" ON "pricing_tiers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_tiers_tenant_id_name_key" ON "pricing_tiers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "customers_pricing_tier_id_idx" ON "customers"("pricing_tier_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_pricing_tier_id_fkey" FOREIGN KEY ("pricing_tier_id") REFERENCES "pricing_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
