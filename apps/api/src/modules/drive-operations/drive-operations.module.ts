import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { QuotaModule } from '../quota/quota.module';
import { MoveFolderUseCase } from './application/move-folder.use-case';
import { CopyFolderUseCase } from './application/copy-folder.use-case';
import { DeleteFolderUseCase } from './application/delete-folder.use-case';
import { MoveFileUseCase } from './application/move-file.use-case';
import { CopyFileUseCase } from './application/copy-file.use-case';
import { DeleteFileUseCase } from './application/delete-file.use-case';
import { FolderOperationsController } from './interface/folder-operations.controller';
import { FileOperationsController } from './interface/file-operations.controller';

/** Move/copy/recursive-delete for both folders and files. Neither FoldersModule nor FilesModule
 * depends on the other for this (that would make them mutually dependent — FilesModule already
 * imports FoldersModule for FOLDER_REPOSITORY on file creation) — this module sits above both,
 * the same shape as DownloadsModule sitting above Files + Storage. */
@Module({
  imports: [FoldersModule, FilesModule, StorageModule, QuotaModule],
  controllers: [FolderOperationsController, FileOperationsController],
  providers: [
    MoveFolderUseCase,
    CopyFolderUseCase,
    DeleteFolderUseCase,
    MoveFileUseCase,
    CopyFileUseCase,
    DeleteFileUseCase,
  ],
})
export class DriveOperationsModule {}
