import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { UsersModule } from '../users/users.module';
import { ORGANIZATION_REPOSITORY } from './domain/organization.repository';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository';
import { WORKSPACE_REPOSITORY } from './domain/workspace.repository';
import { PrismaWorkspaceRepository } from './infrastructure/prisma-workspace.repository';
import { ORGANIZATION_MEMBER_REPOSITORY } from './domain/organization-member.repository';
import { PrismaOrganizationMemberRepository } from './infrastructure/prisma-organization-member.repository';
import { OrgRoleResolver } from './domain/org-role-resolver.service';
import { CreateOrganizationUseCase } from './application/create-organization.use-case';
import { GetOrganizationUseCase } from './application/get-organization.use-case';
import { ListMyOrganizationsUseCase } from './application/list-my-organizations.use-case';
import { RenameOrganizationUseCase } from './application/rename-organization.use-case';
import { DeleteOrganizationUseCase } from './application/delete-organization.use-case';
import { CreateWorkspaceUseCase } from './application/create-workspace.use-case';
import { GetWorkspaceUseCase } from './application/get-workspace.use-case';
import { ListWorkspacesForOrganizationUseCase } from './application/list-workspaces-for-organization.use-case';
import { RenameWorkspaceUseCase } from './application/rename-workspace.use-case';
import { DeleteWorkspaceUseCase } from './application/delete-workspace.use-case';
import { GetWorkspaceRootFolderUseCase } from './application/get-workspace-root-folder.use-case';
import { ListOrganizationMembersUseCase } from './application/list-organization-members.use-case';
import { ChangeMemberRoleUseCase } from './application/change-member-role.use-case';
import { RemoveOrganizationMemberUseCase } from './application/remove-organization-member.use-case';
import { OrganizationsController } from './interface/organizations.controller';

@Module({
  imports: [FoldersModule, UsersModule],
  controllers: [OrganizationsController],
  providers: [
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: PrismaOrganizationRepository,
    },
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
    {
      provide: ORGANIZATION_MEMBER_REPOSITORY,
      useClass: PrismaOrganizationMemberRepository,
    },
    OrgRoleResolver,
    CreateOrganizationUseCase,
    GetOrganizationUseCase,
    ListMyOrganizationsUseCase,
    RenameOrganizationUseCase,
    DeleteOrganizationUseCase,
    CreateWorkspaceUseCase,
    GetWorkspaceUseCase,
    ListWorkspacesForOrganizationUseCase,
    RenameWorkspaceUseCase,
    DeleteWorkspaceUseCase,
    GetWorkspaceRootFolderUseCase,
    ListOrganizationMembersUseCase,
    ChangeMemberRoleUseCase,
    RemoveOrganizationMemberUseCase,
  ],
  exports: [
    ORGANIZATION_REPOSITORY,
    ORGANIZATION_MEMBER_REPOSITORY,
    WORKSPACE_REPOSITORY,
    OrgRoleResolver,
  ],
})
export class OrganizationsModule {}
