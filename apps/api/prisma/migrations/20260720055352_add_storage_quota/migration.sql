-- CreateEnum
CREATE TYPE "QuotaSubjectType" AS ENUM ('USER', 'ORGANIZATION');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUOTA_WARNING';

-- AlterTable
ALTER TABLE "StorageObject" ADD COLUMN     "quotaSubjectId" TEXT,
ADD COLUMN     "quotaSubjectType" "QuotaSubjectType";

-- CreateTable
CREATE TABLE "StorageQuota" (
    "id" TEXT NOT NULL,
    "subjectType" "QuotaSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "limitBytes" BIGINT NOT NULL,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "lastNotifiedThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageQuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageQuota_subjectType_subjectId_key" ON "StorageQuota"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "StorageObject_quotaSubjectType_quotaSubjectId_idx" ON "StorageObject"("quotaSubjectType", "quotaSubjectId");
