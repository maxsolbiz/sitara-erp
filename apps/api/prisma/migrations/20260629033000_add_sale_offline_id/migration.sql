-- Add offlineId column for offline PWA support
ALTER TABLE "sales" ADD COLUMN "offline_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_offline_id_key" ON "sales"("offline_id");
