import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { ListAuditLogUseCase } from '../application/list-audit-log.use-case';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  AuditLogPageResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';

@ApiTags('audit-log')
@ApiBearerAuth()
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly listAuditLog: ListAuditLogUseCase) {}

  @Get()
  @ApiOperation({
    summary:
      "The current user's own security audit trail (logins, permission changes, rejected auth attempts)",
  })
  async list(
    @CurrentUser() user: User,
    @Query() query: AuditLogQueryDto,
  ): Promise<AuditLogPageResponseDto> {
    const page = await this.listAuditLog.execute({
      actorId: user.id,
      eventType: query.eventType,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => AuditLogResponseDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }
}
