-- AlterTable
ALTER TABLE "purchase_returns" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "paid_by" BIGINT;
