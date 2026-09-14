-- CreateTable
CREATE TABLE "backup_records" (
    "id" BIGSERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "storage_driver" VARCHAR(20) NOT NULL DEFAULT 'local',
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "checksum" VARCHAR(64),
    "backup_type" VARCHAR(30) NOT NULL DEFAULT 'full',
    "compression" VARCHAR(10) NOT NULL DEFAULT 'gzip',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "app_version" VARCHAR(50),
    "schema_version" VARCHAR(50),
    "record_counts" JSONB,
    "duration_ms" INTEGER,
    "created_by" BIGINT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "restored_at" TIMESTAMP(3),
    "restored_by" BIGINT,
    "error_message" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_records_created_at_idx" ON "backup_records"("created_at");

-- CreateIndex
CREATE INDEX "backup_records_status_idx" ON "backup_records"("status");

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_restored_by_fkey" FOREIGN KEY ("restored_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
