-- Добавление публичного номера заказа и глобального счётчика (для БД без Prisma Migrate)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;

UPDATE "Order" o
SET "orderNumber" = r.n::text
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "Order"
) r
WHERE o.id = r.id AND (o."orderNumber" IS NULL OR o."orderNumber" = '');

UPDATE "Order"
SET "orderNumber" = 'LEG-' || LEFT(REPLACE(id::text, '-', ''), 16)
WHERE "orderNumber" IS NULL OR TRIM("orderNumber") = '';

CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");

ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "OrderNumberSequence" (
    "id" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrderNumberSequence" ("id", "lastNumber")
VALUES (1, (SELECT COUNT(*)::int FROM "Order"))
ON CONFLICT ("id") DO UPDATE SET "lastNumber" = EXCLUDED."lastNumber";

DROP TABLE IF EXISTS "OrderDaySequence";
