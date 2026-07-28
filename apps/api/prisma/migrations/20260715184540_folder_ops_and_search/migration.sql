-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileTag" (
    "fileId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileTag_pkey" PRIMARY KEY ("fileId","tagId")
);

-- CreateTable
CREATE TABLE "FolderTag" (
    "folderId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderTag_pkey" PRIMARY KEY ("folderId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_name_key" ON "Tag"("ownerId", "name");

-- CreateIndex
CREATE INDEX "FileTag_tagId_idx" ON "FileTag"("tagId");

-- CreateIndex
CREATE INDEX "FolderTag_tagId_idx" ON "FolderTag"("tagId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileTag" ADD CONSTRAINT "FileTag_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileTag" ADD CONSTRAINT "FileTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderTag" ADD CONSTRAINT "FolderTag_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderTag" ADD CONSTRAINT "FolderTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GeneratedColumn
-- Full-text search vector, derived from name and kept in sync by Postgres itself (STORED —
-- computed once on write, not recomputed per query). Not represented in schema.prisma: Prisma
-- has no native tsvector type, matching this schema's existing precedent of keeping
-- Postgres-only constructs (the Folder root partial unique index, the Trash/Favorite CHECK
-- constraints) out of the Prisma model entirely and reading them only via raw SQL.
ALTER TABLE "File" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', "name")) STORED;

ALTER TABLE "Folder" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', "name")) STORED;

-- CreateIndex
CREATE INDEX "File_searchVector_idx" ON "File" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Folder_searchVector_idx" ON "Folder" USING GIN ("searchVector");
