-- Глобальная нумерация 1, 2, 3… вместо ЗК-YYYYMMDD-NNNN

CREATE TABLE "OrderNumberSequence" (
    "id" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrderNumberSequence" ("id", "lastNumber") VALUES (1, 0);

-- Перенумерация существующих заказов по дате создания
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "Order"
)
UPDATE "Order" o
SET "orderNumber" = r.n::text
FROM ranked r
WHERE o.id = r.id;

UPDATE "OrderNumberSequence"
SET "lastNumber" = (SELECT COUNT(*)::int FROM "Order")
WHERE "id" = 1;

DROP TABLE IF EXISTS "OrderDaySequence";
