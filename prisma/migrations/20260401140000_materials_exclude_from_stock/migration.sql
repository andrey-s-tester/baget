-- Materials that are not tracked on warehouse: no remainder display in catalog UI, no deduction on order.
-- IF NOT EXISTS: колонка могла уже появиться из db push / ручной правки до применения миграции.
ALTER TABLE "GlassType" ADD COLUMN IF NOT EXISTS "excludeFromStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BackingType" ADD COLUMN IF NOT EXISTS "excludeFromStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccessoryItem" ADD COLUMN IF NOT EXISTS "excludeFromStock" BOOLEAN NOT NULL DEFAULT false;
