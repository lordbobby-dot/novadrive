import { ListAdminAuditLogUseCase } from './list-admin-audit-log.use-case';
import type { AuditLog } from '../../audit/domain/audit-log.entity';
import type { AuditLogRepository } from '../../audit/domain/audit-log.repository';

function makeLog(id: string): AuditLog {
  return {
    id,
    actorId: 'actor-1',
    eventType: 'LOGIN',
    outcome: 'SUCCESS',
    targetType: null,
    targetId: null,
    metadata: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
  };
}

describe('ListAdminAuditLogUseCase', () => {
  let auditLog: jest.Mocked<AuditLogRepository>;
  let useCase: ListAdminAuditLogUseCase;

  beforeEach(() => {
    auditLog = {
      create: jest.fn(),
      list: jest.fn(),
      deleteOlderThan: jest.fn(),
    };
    useCase = new ListAdminAuditLogUseCase(auditLog);
  });

  it('passes an unscoped query straight through (no actorId) for an admin-wide view', async () => {
    auditLog.list.mockResolvedValue([makeLog('1')]);

    await useCase.execute({ limit: 20 });

    expect(auditLog.list).toHaveBeenCalledWith({ limit: 20 });
  });

  it('forwards actorId/eventType/targetType filters and paginates via the lookahead row', async () => {
    auditLog.list.mockResolvedValue([makeLog('1'), makeLog('2')]);

    const page = await useCase.execute({
      actorId: 'actor-1',
      eventType: 'USER_SUSPENDED',
      targetType: 'USER',
      limit: 1,
    });

    expect(auditLog.list).toHaveBeenCalledWith({
      actorId: 'actor-1',
      eventType: 'USER_SUSPENDED',
      targetType: 'USER',
      limit: 1,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('1');
  });
});
