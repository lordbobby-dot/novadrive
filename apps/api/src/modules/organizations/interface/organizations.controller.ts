import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { FolderResponseDto } from '../../folders/interface/dto/folder-response.dto';
import { CreateOrganizationUseCase } from '../application/create-organization.use-case';
import { GetOrganizationUseCase } from '../application/get-organization.use-case';
import { ListMyOrganizationsUseCase } from '../application/list-my-organizations.use-case';
import { RenameOrganizationUseCase } from '../application/rename-organization.use-case';
import { DeleteOrganizationUseCase } from '../application/delete-organization.use-case';
import { CreateWorkspaceUseCase } from '../application/create-workspace.use-case';
import { GetWorkspaceUseCase } from '../application/get-workspace.use-case';
import { ListWorkspacesForOrganizationUseCase } from '../application/list-workspaces-for-organization.use-case';
import { RenameWorkspaceUseCase } from '../application/rename-workspace.use-case';
import { DeleteWorkspaceUseCase } from '../application/delete-workspace.use-case';
import { GetWorkspaceRootFolderUseCase } from '../application/get-workspace-root-folder.use-case';
import { ListOrganizationMembersUseCase } from '../application/list-organization-members.use-case';
import { ChangeMemberRoleUseCase } from '../application/change-member-role.use-case';
import { RemoveOrganizationMemberUseCase } from '../application/remove-organization-member.use-case';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { RenameOrganizationDto } from './dto/rename-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { RenameWorkspaceDto } from './dto/rename-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller()
export class OrganizationsController {
  constructor(
    private readonly createOrganization: CreateOrganizationUseCase,
    private readonly getOrganization: GetOrganizationUseCase,
    private readonly listMyOrganizations: ListMyOrganizationsUseCase,
    private readonly renameOrganization: RenameOrganizationUseCase,
    private readonly deleteOrganization: DeleteOrganizationUseCase,
    private readonly createWorkspace: CreateWorkspaceUseCase,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly listWorkspaces: ListWorkspacesForOrganizationUseCase,
    private readonly renameWorkspace: RenameWorkspaceUseCase,
    private readonly deleteWorkspace: DeleteWorkspaceUseCase,
    private readonly getWorkspaceRootFolder: GetWorkspaceRootFolderUseCase,
    private readonly listMembers: ListOrganizationMembersUseCase,
    private readonly changeMemberRole: ChangeMemberRoleUseCase,
    private readonly removeMember: RemoveOrganizationMemberUseCase,
  ) {}

  @Post('organizations')
  @ApiOperation({
    summary: 'Create a new organization (creator becomes owner)',
  })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const org = await this.createOrganization.execute({
      ownerId: user.id,
      name: dto.name,
    });
    return OrganizationResponseDto.fromDomain(org, 'OWNER');
  }

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations the caller owns or belongs to' })
  async listMine(
    @CurrentUser() user: User,
  ): Promise<OrganizationResponseDto[]> {
    const orgs = await this.listMyOrganizations.execute(user.id);
    return orgs.map((entry) =>
      OrganizationResponseDto.fromDomain(entry.organization, entry.myRole),
    );
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get a single organization' })
  async get(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<OrganizationResponseDto> {
    const { organization, myRole } = await this.getOrganization.execute(
      user.id,
      id,
    );
    return OrganizationResponseDto.fromDomain(organization, myRole);
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Rename an organization (ADMIN+)' })
  async rename(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RenameOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const org = await this.renameOrganization.execute(user.id, id, dto.name);
    const { myRole } = await this.getOrganization.execute(user.id, id);
    return OrganizationResponseDto.fromDomain(org, myRole);
  }

  @Delete('organizations/:id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete an organization (OWNER only) — cascades to every workspace/folder/file inside it',
  })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteOrganization.execute(user.id, id);
  }

  @Post('organizations/:id/workspaces')
  @ApiOperation({
    summary:
      'Create a workspace in an organization (ADMIN+) — also creates its root folder',
  })
  async createWorkspaceInOrg(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.createWorkspace.execute({
      actorId: user.id,
      organizationId: id,
      name: dto.name,
    });
    return WorkspaceResponseDto.fromDomain(workspace);
  }

  @Get('organizations/:id/workspaces')
  @ApiOperation({ summary: 'List workspaces in an organization' })
  async listWorkspacesInOrg(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<WorkspaceResponseDto[]> {
    const workspaces = await this.listWorkspaces.execute(user.id, id);
    return workspaces.map((w) => WorkspaceResponseDto.fromDomain(w));
  }

  @Get('organizations/:id/members')
  @ApiOperation({ summary: "List an organization's members (owner included)" })
  async listOrgMembers(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<OrganizationMemberResponseDto[]> {
    const members = await this.listMembers.execute(user.id, id);
    return members.map((m) => OrganizationMemberResponseDto.fromDomain(m));
  }

  @Patch('organizations/:id/members/:userId')
  @ApiOperation({
    summary: "Change a member's org role (ADMIN+, can't outrank yourself)",
  })
  async changeRole(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<OrganizationMemberResponseDto> {
    const member = await this.changeMemberRole.execute(
      user.id,
      id,
      targetUserId,
      dto.role,
    );
    const users = await this.listMembers.execute(user.id, id);
    const withUser = users.find(
      (entry) => entry.member.userId === targetUserId,
    );
    return OrganizationMemberResponseDto.fromDomain(
      withUser ?? { member, email: null, name: null },
    );
  }

  @Delete('organizations/:id/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a member from an organization (ADMIN+)' })
  async removeOrgMember(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    await this.removeMember.execute(user.id, id, targetUserId);
  }

  @Get('workspaces/:id')
  @ApiOperation({ summary: 'Get a single workspace' })
  async getOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.getWorkspace.execute(user.id, id);
    return WorkspaceResponseDto.fromDomain(workspace);
  }

  @Patch('workspaces/:id')
  @ApiOperation({ summary: 'Rename a workspace (ADMIN+)' })
  async renameOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RenameWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.renameWorkspace.execute(user.id, id, dto.name);
    return WorkspaceResponseDto.fromDomain(workspace);
  }

  @Delete('workspaces/:id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete a workspace (ADMIN+) — cascades to every folder/file inside it',
  })
  async deleteOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteWorkspace.execute(user.id, id);
  }

  @Get('workspaces/:id/root-folder')
  @ApiOperation({
    summary:
      "Get a workspace's root folder — the entry point for navigating into it, same shape as GET /folders/root",
  })
  async rootFolder(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.getWorkspaceRootFolder.execute(user.id, id);
    return FolderResponseDto.fromDomain(folder);
  }
}
