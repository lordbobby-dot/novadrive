import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module';
import { ACTIVITY_REPOSITORY } from './domain/activity.repository';
import { PrismaActivityRepository } from './infrastructure/prisma-activity.repository';
import { ActivityListener } from './infrastructure/activity.listener';
import { ListActivityUseCase } from './application/list-activity.use-case';
import { ActivityController } from './interface/activity.controller';

@Module({
  imports: [SharingModule],
  controllers: [ActivityController],
  providers: [
    { provide: ACTIVITY_REPOSITORY, useClass: PrismaActivityRepository },
    ActivityListener,
    ListActivityUseCase,
  ],
})
export class ActivityModule {}
