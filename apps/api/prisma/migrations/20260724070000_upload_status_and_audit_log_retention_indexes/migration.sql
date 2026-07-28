-- CreateIndex
CREATE INDEX "StorageObject_uploadStatus_createdAt_idx" ON "StorageObject"("uploadStatus", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
