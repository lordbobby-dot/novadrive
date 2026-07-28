import type { ConfigService } from '@nestjs/config';
import { PurgeAuditLogsUseCase } from './purge-audit-logs.use-case';
import type { AuditLogRepository } from '../domain/audit-log.repository';
import type { EnvConfig } from '../../../config/env.validation';

describe('PurgeAuditLogsUseCase', () => {
  let auditLog: jest.Mocked<AuditLogRepository>;
  let config: jest.Mocked<ConfigService<EnvConfig, true>>;
  let useCase: PurgeAuditLogsUseCase;

  beforeEach(() => {
    auditLog = {
      create: jest.fn(),
      list: jest.fn(),
      deleteOlderThan: jest.fn(),
    };
    config = {
      get: jest.fn().mockReturnValue(90),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    useCase = new PurgeAuditLogsUseCase(auditLog, config);
  });

  it('deletes rows older than the configured retention window and returns the count', async () => {
    auditLog.deleteOlderThan.mockResolvedValue(42);

    const result = await useCase.execute();

    expect(result).toEqual({ deleted: 42 });
    expect(auditLog.deleteOlderThan).toHaveBeenCalledTimes(1);
  });

  it('computes the cutoff from AUDIT_LOG_RETENTION_DAYS', async () => {
    auditLog.deleteOlderThan.mockResolvedValue(0);
    await useCase.execute();
    expect(config.get).toHaveBeenCalledWith('AUDIT_LOG_RETENTION_DAYS', {
      infer: true,
    });
  });
});
