import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import {
  AuditLogPageResponseDto,
  AuditLogResponseDto,
} from '../../audit/interface/dto/audit-log-response.dto';
import { ListAdminAuditLogUseCase } from '../application/list-admin-audit-log.use-case';
import { AdminAuditLogQueryDto } from './dto/admin-audit-log-query.dto';

@ApiTags('admin')
@ApiBearerAuth()
@RequireAdmin()
@Controller('admin/audit-logs')
export class AdminAuditLogController {
  constructor(private readonly listAdminAuditLog: ListAdminAuditLogUseCase) {}

  @Get()
  @ApiOperation({
    summary:
      "Every user's security audit trail, optionally filtered by actor/event/target",
  })
  async list(
    @Query() query: AdminAuditLogQueryDto,
  ): Promise<AuditLogPageResponseDto> {
    const page = await this.listAdminAuditLog.execute({
      actorId: query.actorId,
      eventType: query.eventType,
      targetType: query.targetType,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => AuditLogResponseDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }
}
