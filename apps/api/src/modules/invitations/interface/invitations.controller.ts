import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import { PermissionResponseDto } from '../../sharing/interface/dto/permission-response.dto';
import { CreateInvitationUseCase } from '../application/create-invitation.use-case';
import { AcceptInvitationUseCase } from '../application/accept-invitation.use-case';
import { ListInvitationsForResourceUseCase } from '../application/list-invitations-for-resource.use-case';
import { RevokeInvitationUseCase } from '../application/revoke-invitation.use-case';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';

@ApiTags('invitations')
@ApiBearerAuth()
@Controller()
export class InvitationsController {
  constructor(
    private readonly createInvitation: CreateInvitationUseCase,
    private readonly acceptInvitation: AcceptInvitationUseCase,
    private readonly listInvitations: ListInvitationsForResourceUseCase,
    private readonly revokeInvitation: RevokeInvitationUseCase,
  ) {}

  @Post('invitations')
  @ApiOperation({ summary: 'Invite someone by email to a file or folder' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    const invitation = await this.createInvitation.execute({
      inviterId: user.id,
      email: dto.email,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      role: dto.role,
    });
    return InvitationResponseDto.fromDomain(invitation);
  }

  @Post('invitations/:token/accept')
  // Requires auth, but the token itself is the actual security boundary — tightened as
  // defense-in-depth against token-guessing by a signed-in attacker.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Accept an invitation — the signed-in user must match the invited email address',
  })
  async accept(
    @CurrentUser() user: User,
    @Param('token') token: string,
  ): Promise<PermissionResponseDto> {
    const permission = await this.acceptInvitation.execute(user.id, token);
    return PermissionResponseDto.fromDomain(permission);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.revokeInvitation.execute(user.id, id);
  }

  @Get('resources/:type/:id/invitations')
  @ApiOperation({
    summary: 'List pending/past invitations for a file or folder',
  })
  async list(
    @CurrentUser() user: User,
    @Param('type') type: string,
    @Param('id') id: string,
  ): Promise<InvitationResponseDto[]> {
    const resourceType = type.toUpperCase() as ResourceTypeName;
    const invitations = await this.listInvitations.execute(
      user.id,
      resourceType,
      id,
    );
    return invitations.map((invitation) =>
      InvitationResponseDto.fromDomain(invitation),
    );
  }
}
