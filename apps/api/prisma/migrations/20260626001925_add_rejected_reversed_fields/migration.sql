-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "reversed_at" TIMESTAMP(3),
ADD COLUMN     "reversed_by" BIGINT;

-- AlterTable
ALTER TABLE "sales_returns" ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by" BIGINT,
ADD COLUMN     "rejection_reason" TEXT;
