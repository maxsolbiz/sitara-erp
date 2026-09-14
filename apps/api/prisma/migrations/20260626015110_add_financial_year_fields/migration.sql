-- AlterTable
ALTER TABLE "financial_years" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by" BIGINT,
ADD COLUMN     "notes" TEXT;
