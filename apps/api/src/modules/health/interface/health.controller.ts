import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { GetReadinessUseCase } from '../../../infrastructure/health/get-readiness.use-case';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly getReadiness: GetReadinessUseCase) {}

  @Get()
  @ApiOperation({
    summary:
      'Liveness check — process is up, nothing more. See GET /health/ready for dependencies.',
  })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Readiness check — 200 only if Postgres, Redis, and S3 are all reachable; 503 otherwise',
  })
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.getReadiness.execute();
    if (result.status === 'unhealthy') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
