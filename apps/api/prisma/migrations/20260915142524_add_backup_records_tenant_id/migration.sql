-- Repair schema/migration drift: schema.prisma declares
-- BackupRecord.tenantId (non-nullable, FK to tenants, indexed) and all
-- backup route code queries backup_records.tenant_id, but migration
-- 20260629081330_add_backup_records_enterprise never created the column.
-- Databases built out-of-band (db push / manual DDL) already have it, so
-- every statement below is idempotent: real CREATE on fresh databases,
-- clean no-op where the column/index/constraint already exist.
-- Body generated via `prisma migrate diff` (history vs schema); only the
-- IF NOT EXISTS / duplicate_object guards were added for idempotency.

-- AlterTable
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "tenant_id" BIGINT NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "backup_records_tenant_id_idx" ON "backup_records"("tenant_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
