-- AlterEnum (IF NOT EXISTS — значение могло уже быть добавлено вручную / db push)
ALTER TYPE "StockItemKind" ADD VALUE IF NOT EXISTS 'showcase';
