import { Module } from '@nestjs/common';
import { DependencyHealthModule } from '../../infrastructure/health/dependency-health.module';
import { GetReadinessUseCase } from '../../infrastructure/health/get-readiness.use-case';
import { HealthController } from './interface/health.controller';

@Module({
  imports: [DependencyHealthModule],
  controllers: [HealthController],
  providers: [GetReadinessUseCase],
})
export class HealthModule {}
