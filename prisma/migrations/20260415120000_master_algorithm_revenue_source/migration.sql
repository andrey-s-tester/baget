-- Источник выручки по операциям мастера: тариф из алгоритма или строка чека заказа (frame/assembly/glass/backing/matboard)

ALTER TABLE "SalaryMasterAlgorithm"
  ADD COLUMN IF NOT EXISTS "frameAssemblyRevenueSource" TEXT NOT NULL DEFAULT 'perimeter_tariff',
  ADD COLUMN IF NOT EXISTS "canvasStretchRevenueSource" TEXT NOT NULL DEFAULT 'area_tariff',
  ADD COLUMN IF NOT EXISTS "glassRevenueSource" TEXT NOT NULL DEFAULT 'unit_tariff',
  ADD COLUMN IF NOT EXISTS "backingRevenueSource" TEXT NOT NULL DEFAULT 'unit_tariff',
  ADD COLUMN IF NOT EXISTS "matCutRevenueSource" TEXT NOT NULL DEFAULT 'unit_tariff';
