import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { TAG_REPOSITORY } from './domain/tag.repository';
import { PrismaTagRepository } from './infrastructure/prisma-tag.repository';
import { ListTagsUseCase } from './application/list-tags.use-case';
import { GetFileTagsUseCase } from './application/get-file-tags.use-case';
import { SetFileTagsUseCase } from './application/set-file-tags.use-case';
import { GetFolderTagsUseCase } from './application/get-folder-tags.use-case';
import { SetFolderTagsUseCase } from './application/set-folder-tags.use-case';
import { TagsController } from './interface/tags.controller';
import { FileTagsController } from './interface/file-tags.controller';
import { FolderTagsController } from './interface/folder-tags.controller';

@Module({
  imports: [FoldersModule, FilesModule],
  controllers: [TagsController, FileTagsController, FolderTagsController],
  providers: [
    { provide: TAG_REPOSITORY, useClass: PrismaTagRepository },
    ListTagsUseCase,
    GetFileTagsUseCase,
    SetFileTagsUseCase,
    GetFolderTagsUseCase,
    SetFolderTagsUseCase,
  ],
  exports: [TAG_REPOSITORY],
})
export class TagsModule {}
