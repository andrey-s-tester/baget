-- Какими операциями занимается мастер: при снятой галочке начисление по этой услуге не считается.
ALTER TABLE "SalaryMasterAlgorithm" ADD COLUMN IF NOT EXISTS "doesFrameAssembly" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryMasterAlgorithm" ADD COLUMN IF NOT EXISTS "doesCanvasStretch" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryMasterAlgorithm" ADD COLUMN IF NOT EXISTS "doesGlass" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryMasterAlgorithm" ADD COLUMN IF NOT EXISTS "doesBacking" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryMasterAlgorithm" ADD COLUMN IF NOT EXISTS "doesMatCut" BOOLEAN NOT NULL DEFAULT true;
