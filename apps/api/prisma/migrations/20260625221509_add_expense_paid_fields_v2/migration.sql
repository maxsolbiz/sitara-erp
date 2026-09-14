-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "paid_by" BIGINT;
