-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETED', 'ABORTED', 'FAILED');

-- AlterTable
ALTER TABLE "StorageObject" ADD COLUMN     "clientChecksum" TEXT,
ADD COLUMN     "partSize" BIGINT,
ADD COLUMN     "totalParts" INTEGER,
ADD COLUMN     "uploadId" TEXT,
ADD COLUMN     "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "UploadPart" (
    "id" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "eTag" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadPart_storageObjectId_partNumber_key" ON "UploadPart"("storageObjectId", "partNumber");

-- CreateIndex
CREATE INDEX "StorageObject_ownerId_uploadStatus_idx" ON "StorageObject"("ownerId", "uploadStatus");

-- AddForeignKey
ALTER TABLE "UploadPart" ADD CONSTRAINT "UploadPart_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
