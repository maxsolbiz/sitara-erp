-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "new_values" JSONB,
ADD COLUMN     "old_values" JSONB;
