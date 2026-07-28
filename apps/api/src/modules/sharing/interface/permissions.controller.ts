import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import type { ResourceTypeName } from '../domain/permission.entity';
import { GrantPermissionUseCase } from '../application/grant-permission.use-case';
import { RevokePermissionUseCase } from '../application/revoke-permission.use-case';
import { ListPermissionsForResourceUseCase } from '../application/list-permissions-for-resource.use-case';
import { ListSharedWithMeUseCase } from '../application/list-shared-with-me.use-case';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { PermissionResponseDto } from './dto/permission-response.dto';
import { SharedWithMeQueryDto } from './dto/shared-with-me-query.dto';
import {
  SharedWithMeItemDto,
  SharedWithMePageDto,
} from './dto/shared-with-me-item-response.dto';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller()
export class PermissionsController {
  constructor(
    private readonly grantPermission: GrantPermissionUseCase,
    private readonly revokePermission: RevokePermissionUseCase,
    private readonly listPermissions: ListPermissionsForResourceUseCase,
    private readonly listSharedWithMe: ListSharedWithMeUseCase,
  ) {}

  @Post('permissions')
  @ApiOperation({ summary: 'Grant a role on a file or folder to another user' })
  async grant(
    @CurrentUser() user: User,
    @Body() dto: GrantPermissionDto,
  ): Promise<PermissionResponseDto> {
    const permission = await this.grantPermission.execute({
      granterId: user.id,
      subjectId: dto.subjectId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      role: dto.role,
    });
    return PermissionResponseDto.fromDomain(permission);
  }

  @Delete('permissions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a previously granted permission' })
  async revoke(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.revokePermission.execute(user.id, id);
  }

  @Get('shared-with-me')
  @ApiOperation({
    summary:
      'Files and folders directly shared with the caller by someone else, most recently granted first',
  })
  async sharedWithMe(
    @CurrentUser() user: User,
    @Query() query: SharedWithMeQueryDto,
  ): Promise<SharedWithMePageDto> {
    const page = await this.listSharedWithMe.execute(
      user.id,
      query.cursor,
      query.limit ?? 20,
    );
    return {
      items: page.items.map((item) => SharedWithMeItemDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get('resources/:type/:id/permissions')
  @ApiOperation({
    summary: 'List everyone with explicit access to a file or folder',
  })
  async list(
    @CurrentUser() user: User,
    @Param('type') type: string,
    @Param('id') id: string,
  ): Promise<PermissionResponseDto[]> {
    const resourceType = type.toUpperCase() as ResourceTypeName;
    const permissions = await this.listPermissions.execute(
      user.id,
      resourceType,
      id,
    );
    return permissions.map((permission) =>
      PermissionResponseDto.fromDomainWithSubject(permission),
    );
  }
}
