-- FixGeneratedColumn
-- Postgres's default text-search parser treats "sample.json" as a single compound "file" token,
-- not the words "sample" and "json" — so a plain-language search for "sample" would never match
-- it. Replacing separator characters (., _, -) with spaces before tokenizing splits filenames
-- into their component words, which is what users actually expect "search by partial name" to do.
ALTER TABLE "File" DROP COLUMN "searchVector";
ALTER TABLE "File" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', regexp_replace("name", '[._-]+', ' ', 'g'))) STORED;
CREATE INDEX "File_searchVector_idx" ON "File" USING GIN ("searchVector");

ALTER TABLE "Folder" DROP COLUMN "searchVector";
ALTER TABLE "Folder" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', regexp_replace("name", '[._-]+', ' ', 'g'))) STORED;
CREATE INDEX "Folder_searchVector_idx" ON "Folder" USING GIN ("searchVector");
