-- Единица учёта цены фурнитуры: шт или погонный метр (периметр проёма с учётом паспарту)
CREATE TYPE "AccessoryPriceUnit" AS ENUM ('piece', 'linear_meter');

ALTER TABLE "AccessoryItem" ADD COLUMN "priceUnit" "AccessoryPriceUnit" NOT NULL DEFAULT 'piece';

ALTER TYPE "AccessoryGroup" ADD VALUE 'finishing';

UPDATE "AccessoryItem" SET "priceUnit" = 'linear_meter' WHERE "group" = 'subframe';
