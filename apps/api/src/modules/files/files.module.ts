import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { FILE_REPOSITORY } from './domain/file.repository';
import { PrismaFileRepository } from './infrastructure/prisma-file.repository';
import { RenameFileUseCase } from './application/rename-file.use-case';
import { GetFileUseCase } from './application/get-file.use-case';
import { ListFilesByFolderUseCase } from './application/list-files-by-folder.use-case';
import { FilesController } from './interface/files.controller';

@Module({
  imports: [FoldersModule],
  controllers: [FilesController],
  providers: [
    { provide: FILE_REPOSITORY, useClass: PrismaFileRepository },
    RenameFileUseCase,
    GetFileUseCase,
    ListFilesByFolderUseCase,
  ],
  exports: [FILE_REPOSITORY],
})
export class FilesModule {}
