import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { GetAdminAnalyticsUseCase } from '../application/get-admin-analytics.use-case';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';
import { AdminAnalyticsResponseDto } from './dto/admin-analytics-response.dto';

@ApiTags('admin')
@ApiBearerAuth()
@RequireAdmin()
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly getAdminAnalytics: GetAdminAnalyticsUseCase) {}

  @Get()
  @ApiOperation({
    summary:
      'Signups over time, cumulative storage growth, and active-user counts',
  })
  async get(
    @Query() query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsResponseDto> {
    const result = await this.getAdminAnalytics.execute(query.windowDays ?? 30);
    return AdminAnalyticsResponseDto.fromDomain(result);
  }
}
