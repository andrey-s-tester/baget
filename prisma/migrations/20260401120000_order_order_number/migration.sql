-- CreateTable
CREATE TABLE "OrderDaySequence" (
    "dayKey" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    CONSTRAINT "OrderDaySequence_pkey" PRIMARY KEY ("dayKey")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;

-- Нумерация существующих заказов по дням (UTC), порядок внутри дня — по createdAt и id
WITH ranked AS (
  SELECT
    id,
    TO_CHAR(("createdAt" AT TIME ZONE 'UTC'), 'YYYYMMDD') AS dk,
    ROW_NUMBER() OVER (
      PARTITION BY DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Order"
)
UPDATE "Order" o
SET "orderNumber" = 'ЗК-' || r.dk || '-' || LPAD(r.rn::text, 4, '0')
FROM ranked r
WHERE o.id = r.id;

-- На случай пустой выборки / старых данных
UPDATE "Order"
SET "orderNumber" = 'ЗК-LEG-' || LEFT(REPLACE(id::text, '-', ''), 20)
WHERE "orderNumber" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;

-- Счётчики по дням для новых заказов (последний выданный seq = lastSeq)
INSERT INTO "OrderDaySequence" ("dayKey", "lastSeq")
SELECT dk, COUNT(*)::int
FROM (
  SELECT TO_CHAR(DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYYMMDD') AS dk
  FROM "Order"
) t
GROUP BY dk;
