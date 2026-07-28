import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { ListActivityUseCase } from '../application/list-activity.use-case';
import {
  ActivityPageResponseDto,
  ActivityResponseDto,
} from './dto/activity-response.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';

@ApiTags('activity')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly listActivity: ListActivityUseCase) {}

  @Get()
  @ApiOperation({
    summary:
      "The current user's activity feed, filterable by target/type/action/date",
  })
  async list(
    @CurrentUser() user: User,
    @Query() query: ActivityQueryDto,
  ): Promise<ActivityPageResponseDto> {
    const page = await this.listActivity.execute({
      ownerId: user.id,
      targetId: query.targetId,
      targetType: query.targetType,
      action: query.action,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => ActivityResponseDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }
}
