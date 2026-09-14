-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "void_reason" TEXT;

-- CreateTable
CREATE TABLE "customer_ledger" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balance_before" DECIMAL(15,2) NOT NULL,
    "balance_after" DECIMAL(15,2) NOT NULL,
    "reference_id" BIGINT,
    "reference_type" VARCHAR(30),
    "notes" TEXT,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_ledger_tenant_id_idx" ON "customer_ledger"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_ledger_customer_id_idx" ON "customer_ledger"("customer_id");

-- CreateIndex
CREATE INDEX "customer_ledger_created_at_idx" ON "customer_ledger"("created_at");

-- AddForeignKey
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
