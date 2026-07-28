-- AlterTable
ALTER TABLE "File" ADD COLUMN     "lastAccessedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "File_ownerId_lastAccessedAt_idx" ON "File"("ownerId", "lastAccessedAt");
