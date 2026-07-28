import { Module } from '@nestjs/common';
import { FOLDER_REPOSITORY } from './domain/folder.repository';
import { PrismaFolderRepository } from './infrastructure/prisma-folder.repository';
import { CreateFolderUseCase } from './application/create-folder.use-case';
import { RenameFolderUseCase } from './application/rename-folder.use-case';
import { ListFolderChildrenUseCase } from './application/list-folder-children.use-case';
import { GetBreadcrumbUseCase } from './application/get-breadcrumb.use-case';
import { GetFolderUseCase } from './application/get-folder.use-case';
import { GetOrCreateRootFolderUseCase } from './application/get-or-create-root-folder.use-case';
import { FoldersController } from './interface/folders.controller';

@Module({
  controllers: [FoldersController],
  providers: [
    { provide: FOLDER_REPOSITORY, useClass: PrismaFolderRepository },
    CreateFolderUseCase,
    RenameFolderUseCase,
    ListFolderChildrenUseCase,
    GetBreadcrumbUseCase,
    GetFolderUseCase,
    GetOrCreateRootFolderUseCase,
  ],
  exports: [FOLDER_REPOSITORY, GetOrCreateRootFolderUseCase],
})
export class FoldersModule {}
