-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "slug" VARCHAR(120),
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;
