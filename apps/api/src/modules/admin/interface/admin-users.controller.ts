import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import type { User } from '../../users/domain/user.entity';
import { ListAdminUsersUseCase } from '../application/list-admin-users.use-case';
import { SuspendUserUseCase } from '../application/suspend-user.use-case';
import { UnsuspendUserUseCase } from '../application/unsuspend-user.use-case';
import { SetSystemAdminUseCase } from '../application/set-system-admin.use-case';
import { SetUserQuotaUseCase } from '../application/set-user-quota.use-case';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { SetSystemAdminDto } from './dto/set-system-admin.dto';
import { SetUserQuotaDto } from './dto/set-user-quota.dto';
import {
  AdminUserPageResponseDto,
  AdminUserResponseDto,
} from './dto/admin-user-response.dto';

@ApiTags('admin')
@ApiBearerAuth()
@RequireAdmin()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly listAdminUsers: ListAdminUsersUseCase,
    private readonly suspendUser: SuspendUserUseCase,
    private readonly unsuspendUser: UnsuspendUserUseCase,
    private readonly setSystemAdmin: SetSystemAdminUseCase,
    private readonly setUserQuota: SetUserQuotaUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search and paginate every user on the platform' })
  async list(
    @Query() query: AdminUserQueryDto,
  ): Promise<AdminUserPageResponseDto> {
    const page = await this.listAdminUsers.execute({
      search: query.search,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => AdminUserResponseDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Patch(':id/suspend')
  @ApiOperation({
    summary:
      'Suspend a user — bans them in Clerk (revoking every live session) and marks them locally',
  })
  async suspend(
    @CurrentUser() admin: User,
    @Param('id') id: string,
  ): Promise<AdminUserResponseDto> {
    const user = await this.suspendUser.execute(admin.id, id);
    return AdminUserResponseDto.fromDomain(user);
  }

  @Patch(':id/unsuspend')
  @ApiOperation({ summary: 'Reinstate a suspended user' })
  async unsuspend(
    @CurrentUser() admin: User,
    @Param('id') id: string,
  ): Promise<AdminUserResponseDto> {
    const user = await this.unsuspendUser.execute(admin.id, id);
    return AdminUserResponseDto.fromDomain(user);
  }

  @Patch(':id/system-role')
  @ApiOperation({
    summary: 'Grant or revoke the platform-level system-admin role',
  })
  async setRole(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: SetSystemAdminDto,
  ): Promise<AdminUserResponseDto> {
    const user = await this.setSystemAdmin.execute(
      admin.id,
      id,
      dto.isSystemAdmin,
    );
    return AdminUserResponseDto.fromDomain(user);
  }

  @Patch(':id/quota')
  @ApiOperation({
    summary:
      "Override a user's storage quota limit (bytes) — replaces the DEFAULT_USER_QUOTA_BYTES that would otherwise apply",
  })
  async setQuota(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: SetUserQuotaDto,
  ): Promise<AdminUserResponseDto> {
    const user = await this.setUserQuota.execute(admin.id, id, dto.limitBytes);
    return AdminUserResponseDto.fromDomain(user);
  }
}
