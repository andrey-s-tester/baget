-- AlterTable (IF NOT EXISTS — колонка могла уже быть из db push)
ALTER TABLE "ShowcaseProduct" ADD COLUMN IF NOT EXISTS "stockQty" INTEGER NOT NULL DEFAULT 0;

UPDATE "ShowcaseProduct" SET "stockQty" = CASE WHEN "inStock" THEN 1 ELSE 0 END;
