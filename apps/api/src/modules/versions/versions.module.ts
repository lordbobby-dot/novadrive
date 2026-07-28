import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { FILE_VERSION_REPOSITORY } from './domain/file-version.repository';
import { PrismaFileVersionRepository } from './infrastructure/prisma-file-version.repository';
import { ListFileVersionsUseCase } from './application/list-file-versions.use-case';
import { AddFileVersionUseCase } from './application/add-file-version.use-case';
import { RestoreFileVersionUseCase } from './application/restore-file-version.use-case';
import { GetFileVersionDownloadUrlUseCase } from './application/get-file-version-download-url.use-case';
import { FileVersionsController } from './interface/file-versions.controller';

@Module({
  imports: [FilesModule, StorageModule],
  controllers: [FileVersionsController],
  providers: [
    { provide: FILE_VERSION_REPOSITORY, useClass: PrismaFileVersionRepository },
    ListFileVersionsUseCase,
    AddFileVersionUseCase,
    RestoreFileVersionUseCase,
    GetFileVersionDownloadUrlUseCase,
  ],
  exports: [FILE_VERSION_REPOSITORY, AddFileVersionUseCase],
})
export class VersionsModule {}
