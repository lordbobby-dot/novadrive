import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import type { User } from '../../users/domain/user.entity';
import { ListAdminOrganizationsUseCase } from '../application/list-admin-organizations.use-case';
import { GetAdminOrganizationDetailUseCase } from '../application/get-admin-organization-detail.use-case';
import { SetOrganizationQuotaUseCase } from '../application/set-organization-quota.use-case';
import { TransferOrganizationOwnershipUseCase } from '../application/transfer-organization-ownership.use-case';
import { AdminDeleteOrganizationUseCase } from '../application/admin-delete-organization.use-case';
import { AdminChangeMemberRoleUseCase } from '../application/admin-change-member-role.use-case';
import { AdminRemoveOrganizationMemberUseCase } from '../application/admin-remove-organization-member.use-case';
import { AdminOrganizationQueryDto } from './dto/admin-organization-query.dto';
import { SetOrganizationQuotaDto } from './dto/set-organization-quota.dto';
import { TransferOrganizationOwnershipDto } from './dto/transfer-organization-ownership.dto';
import { AdminChangeMemberRoleDto } from './dto/admin-change-member-role.dto';
import {
  AdminOrganizationPageResponseDto,
  AdminOrganizationResponseDto,
} from './dto/admin-organization-response.dto';
import { AdminOrganizationDetailResponseDto } from './dto/admin-organization-detail-response.dto';

@ApiTags('admin')
@ApiBearerAuth()
@RequireAdmin()
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(
    private readonly listAdminOrganizations: ListAdminOrganizationsUseCase,
    private readonly getOrganizationDetail: GetAdminOrganizationDetailUseCase,
    private readonly setOrganizationQuota: SetOrganizationQuotaUseCase,
    private readonly transferOwnership: TransferOrganizationOwnershipUseCase,
    private readonly deleteOrganization: AdminDeleteOrganizationUseCase,
    private readonly changeMemberRole: AdminChangeMemberRoleUseCase,
    private readonly removeMember: AdminRemoveOrganizationMemberUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Search and paginate every organization on the platform, with usage summaries',
  })
  async list(
    @Query() query: AdminOrganizationQueryDto,
  ): Promise<AdminOrganizationPageResponseDto> {
    const page = await this.listAdminOrganizations.execute({
      search: query.search,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) =>
        AdminOrganizationResponseDto.fromDomain(item),
      ),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      "Get a single organization's full detail — members, workspaces, and storage usage",
  })
  async detail(
    @Param('id') id: string,
  ): Promise<AdminOrganizationDetailResponseDto> {
    const detail = await this.getOrganizationDetail.execute(id);
    return AdminOrganizationDetailResponseDto.fromDomain(detail);
  }

  @Patch(':id/quota')
  @ApiOperation({
    summary:
      "Override an organization's storage quota limit (bytes) — replaces the DEFAULT_ORG_QUOTA_BYTES that would otherwise apply",
  })
  async setQuota(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: SetOrganizationQuotaDto,
  ): Promise<AdminOrganizationResponseDto> {
    const org = await this.setOrganizationQuota.execute(
      admin.id,
      id,
      dto.limitBytes,
    );
    return AdminOrganizationResponseDto.fromDomain(org);
  }

  @Patch(':id/owner')
  @ApiOperation({
    summary:
      "Transfer an organization's ownership to a different (any) existing user — the previous owner is downgraded to an explicit ADMIN member rather than losing access",
  })
  async transferOwner(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: TransferOrganizationOwnershipDto,
  ): Promise<AdminOrganizationResponseDto> {
    const org = await this.transferOwnership.execute(
      admin.id,
      id,
      dto.newOwnerId,
    );
    return AdminOrganizationResponseDto.fromDomain(org);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete an organization regardless of owner — cascades to every workspace/folder/file inside it, irreversible',
  })
  async delete(
    @CurrentUser() admin: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteOrganization.execute(admin.id, id);
  }

  @Patch(':id/members/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      "Change a member's role directly — bypasses the self-service OrgRoleResolver check, so an admin need not be a member of the org themselves. Never OWNER; use ownership transfer for that",
  })
  async changeRole(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: AdminChangeMemberRoleDto,
  ): Promise<void> {
    await this.changeMemberRole.execute(admin.id, id, userId, dto.role);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary:
      "Remove a member from the organization directly — bypasses the self-service OrgRoleResolver check. Can't target the owner",
  })
  async removeOrgMember(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.removeMember.execute(admin.id, id, userId);
  }
}
