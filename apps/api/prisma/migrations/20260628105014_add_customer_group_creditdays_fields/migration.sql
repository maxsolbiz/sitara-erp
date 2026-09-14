-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "credit_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customer_group" VARCHAR(50),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "salesperson_id" BIGINT;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
