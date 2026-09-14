-- CreateTable
CREATE TABLE "vendor_ledger" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "vendor_id" BIGINT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balance_before" DECIMAL(15,2) NOT NULL,
    "balance_after" DECIMAL(15,2) NOT NULL,
    "reference_id" BIGINT,
    "reference_type" VARCHAR(30),
    "notes" TEXT,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_ledger_tenant_id_idx" ON "vendor_ledger"("tenant_id");

-- CreateIndex
CREATE INDEX "vendor_ledger_vendor_id_idx" ON "vendor_ledger"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_ledger_created_at_idx" ON "vendor_ledger"("created_at");

-- AddForeignKey
ALTER TABLE "vendor_ledger" ADD CONSTRAINT "vendor_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_ledger" ADD CONSTRAINT "vendor_ledger_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
