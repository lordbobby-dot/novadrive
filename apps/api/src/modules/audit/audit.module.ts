import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AUDIT_LOG_REPOSITORY } from './domain/audit-log.repository';
import { PrismaAuditLogRepository } from './infrastructure/prisma-audit-log.repository';
import { AuditLogListener } from './infrastructure/audit-log.listener';
import { AUDIT_LOG_PURGE_QUEUE } from './infrastructure/audit-log-purge.queue';
import { AuditLogPurgeProcessor } from './infrastructure/audit-log-purge.processor';
import { AuditLogPurgeScheduler } from './infrastructure/audit-log-purge.scheduler';
import { ListAuditLogUseCase } from './application/list-audit-log.use-case';
import { PurgeAuditLogsUseCase } from './application/purge-audit-logs.use-case';
import { AuditLogController } from './interface/audit-log.controller';

@Module({
  imports: [BullModule.registerQueue({ name: AUDIT_LOG_PURGE_QUEUE })],
  controllers: [AuditLogController],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository },
    AuditLogListener,
    ListAuditLogUseCase,
    PurgeAuditLogsUseCase,
    AuditLogPurgeProcessor,
    AuditLogPurgeScheduler,
  ],
  exports: [AUDIT_LOG_REPOSITORY],
})
export class AuditModule {}
