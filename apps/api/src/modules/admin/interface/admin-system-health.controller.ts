import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { GetSystemHealthUseCase } from '../application/get-system-health.use-case';
import { SystemHealthResponseDto } from './dto/system-health-response.dto';

@ApiTags('admin')
@ApiBearerAuth()
@RequireAdmin()
@Controller('admin/system-health')
export class AdminSystemHealthController {
  constructor(private readonly getSystemHealth: GetSystemHealthUseCase) {}

  @Get()
  @ApiOperation({
    summary:
      'Live connectivity check for Postgres, Redis, S3, and background-job queue depth',
  })
  async get(): Promise<SystemHealthResponseDto> {
    const result = await this.getSystemHealth.execute();
    return SystemHealthResponseDto.fromDomain(result);
  }
}
