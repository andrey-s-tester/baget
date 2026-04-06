-- AlterTable
ALTER TABLE "FrameProfile" ADD COLUMN "catalogSource" TEXT NOT NULL DEFAULT 'bagetnaya_masterskaya';

-- CreateIndex
CREATE INDEX "FrameProfile_catalogSource_idx" ON "FrameProfile"("catalogSource");
