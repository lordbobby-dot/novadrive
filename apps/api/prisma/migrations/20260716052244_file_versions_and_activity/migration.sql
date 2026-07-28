-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('UPLOAD', 'DOWNLOAD', 'DELETE', 'RESTORE', 'RENAME', 'MOVE', 'COPY', 'SHARE', 'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'VERSION_RESTORE');

-- CreateEnum
CREATE TYPE "ActivityTargetType" AS ENUM ('FILE', 'FOLDER', 'ACCOUNT');

-- CreateTable
CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "targetType" "ActivityTargetType" NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_storageObjectId_key" ON "FileVersion"("storageObjectId");

-- CreateIndex
CREATE INDEX "FileVersion_fileId_idx" ON "FileVersion"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_fileId_versionNumber_key" ON "FileVersion"("fileId", "versionNumber");

-- CreateIndex
CREATE INDEX "Activity_targetId_idx" ON "Activity"("targetId");

-- CreateIndex
CREATE INDEX "Activity_actorId_createdAt_idx" ON "Activity"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every File that already exists gets a version-1 FileVersion pointing at its current
-- storage object, so the version-history UI isn't empty for content uploaded before versioning
-- existed. No DB-side id generator is configured (Prisma's cuid() runs client-side), so ids here
-- are generated with md5(random) instead.
INSERT INTO "FileVersion" ("id", "fileId", "storageObjectId", "versionNumber", "createdBy", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || f."id"), f."id", f."storageObjectId", 1, f."ownerId", f."createdAt"
FROM "File" f;
