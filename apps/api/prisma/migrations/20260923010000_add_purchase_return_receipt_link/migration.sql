-- Purchase-return redesign (follow-up 38): link each return line to the
-- receipt line it returns against so quantity can be capped server-side
-- (received - already-returned). Table is empty in every environment
-- (verified 0 rows on prod), so a required column needs no backfill.
-- Hand-written because `prisma migrate dev` needs a live dev DB and the
-- local Docker postgres was unreachable from this shell; prod applies it
-- via the project's own `prisma migrate deploy` (db:migrate:prod).

-- AlterTable
ALTER TABLE "purchase_return_items" ADD COLUMN "receipt_item_id" BIGINT NOT NULL;

-- CreateIndex
CREATE INDEX "purchase_return_items_receipt_item_id_idx" ON "purchase_return_items"("receipt_item_id");

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_receipt_item_id_fkey" FOREIGN KEY ("receipt_item_id") REFERENCES "purchase_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
