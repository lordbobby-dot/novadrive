import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { GetDownloadUrlUseCase } from './application/get-download-url.use-case';
import { GetPreviewUrlUseCase } from './application/get-preview-url.use-case';
import { DownloadsController } from './interface/downloads.controller';

@Module({
  imports: [FilesModule, StorageModule],
  controllers: [DownloadsController],
  providers: [GetDownloadUrlUseCase, GetPreviewUrlUseCase],
})
export class DownloadsModule {}
