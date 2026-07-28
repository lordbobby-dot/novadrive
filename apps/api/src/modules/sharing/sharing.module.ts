import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PERMISSION_REPOSITORY } from './domain/permission.repository';
import { PrismaPermissionRepository } from './infrastructure/prisma-permission.repository';
import { SHARED_LINK_REPOSITORY } from './domain/shared-link.repository';
import { PrismaSharedLinkRepository } from './infrastructure/prisma-shared-link.repository';
import { PermissionResolver } from './domain/permission-resolver.service';
import { SharedFolderAccessResolver } from './domain/shared-folder-access-resolver.service';
import { PermissionGuard } from './interface/permission.guard';
import { GrantPermissionUseCase } from './application/grant-permission.use-case';
import { RevokePermissionUseCase } from './application/revoke-permission.use-case';
import { ListPermissionsForResourceUseCase } from './application/list-permissions-for-resource.use-case';
import { ListSharedWithMeUseCase } from './application/list-shared-with-me.use-case';
import { CreateSharedLinkUseCase } from './application/create-shared-link.use-case';
import { GetSharedLinkUseCase } from './application/get-shared-link.use-case';
import { DownloadViaSharedLinkUseCase } from './application/download-via-shared-link.use-case';
import { RevokeSharedLinkUseCase } from './application/revoke-shared-link.use-case';
import { ListSharedLinksForResourceUseCase } from './application/list-shared-links-for-resource.use-case';
import { ListSharedFolderSubfoldersUseCase } from './application/list-shared-folder-subfolders.use-case';
import { ListSharedFolderFilesUseCase } from './application/list-shared-folder-files.use-case';
import { GetSharedFolderBreadcrumbUseCase } from './application/get-shared-folder-breadcrumb.use-case';
import { PermissionsController } from './interface/permissions.controller';
import { SharedLinksController } from './interface/shared-links.controller';

@Module({
  imports: [
    FoldersModule,
    FilesModule,
    StorageModule,
    UsersModule,
    OrganizationsModule,
  ],
  controllers: [PermissionsController, SharedLinksController],
  providers: [
    { provide: PERMISSION_REPOSITORY, useClass: PrismaPermissionRepository },
    { provide: SHARED_LINK_REPOSITORY, useClass: PrismaSharedLinkRepository },
    PermissionResolver,
    { provide: APP_GUARD, useClass: PermissionGuard },
    GrantPermissionUseCase,
    RevokePermissionUseCase,
    ListPermissionsForResourceUseCase,
    ListSharedWithMeUseCase,
    CreateSharedLinkUseCase,
    GetSharedLinkUseCase,
    DownloadViaSharedLinkUseCase,
    RevokeSharedLinkUseCase,
    ListSharedLinksForResourceUseCase,
    SharedFolderAccessResolver,
    ListSharedFolderSubfoldersUseCase,
    ListSharedFolderFilesUseCase,
    GetSharedFolderBreadcrumbUseCase,
  ],
  exports: [PERMISSION_REPOSITORY, PermissionResolver],
})
export class SharingModule {}
