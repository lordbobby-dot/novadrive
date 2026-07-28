-- DropIndex
DROP INDEX "Favorite_fileId_key";

-- DropIndex
DROP INDEX "Favorite_folderId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_ownerId_folderId_key" ON "Favorite"("ownerId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_ownerId_fileId_key" ON "Favorite"("ownerId", "fileId");
