import { Module } from '@nestjs/common';
import { STORAGE_ADAPTER } from './domain/storage-adapter';
import { S3ClientProvider } from './infrastructure/s3-client.provider';
import { S3StorageAdapter } from './infrastructure/s3-storage.adapter';

/** The S3 client and StorageAdapter used to live inside UploadsModule, back when only uploads
 * needed them. Milestone 4 (downloads) and Milestone 5 (folder/file copy) both need direct S3
 * access too, and none of Uploads/Downloads/Folders/Files should have to import each other just
 * to reach it — so it's its own leaf module with no dependencies of its own. */
@Module({
  providers: [
    S3ClientProvider,
    { provide: STORAGE_ADAPTER, useClass: S3StorageAdapter },
  ],
  exports: [STORAGE_ADAPTER, S3ClientProvider],
})
export class StorageModule {}
