import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/** Prometheus scrapers don't send an Authorization header, so this is @Public() like /health —
 * excluded from Swagger since it's not a JSON API response, it's Prometheus text-exposition
 * format. */
@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async get(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
