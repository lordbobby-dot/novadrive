import { ListAuditLogUseCase } from './list-audit-log.use-case';
import type { AuditLog } from '../domain/audit-log.entity';
import type { AuditLogRepository } from '../domain/audit-log.repository';

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'audit-1',
    actorId: 'actor-1',
    eventType: 'LOGIN',
    outcome: 'SUCCESS',
    targetType: null,
    targetId: null,
    metadata: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListAuditLogUseCase', () => {
  let auditLog: jest.Mocked<AuditLogRepository>;
  let useCase: ListAuditLogUseCase;

  beforeEach(() => {
    auditLog = {
      create: jest.fn(),
      list: jest.fn(),
      deleteOlderThan: jest.fn(),
    };
    useCase = new ListAuditLogUseCase(auditLog);
  });

  it('passes params through to the repository and paginates the result', async () => {
    auditLog.list.mockResolvedValue([makeAuditLog()]);

    const page = await useCase.execute({
      actorId: 'actor-1',
      eventType: 'LOGIN',
      limit: 20,
    });

    expect(auditLog.list).toHaveBeenCalledWith({
      actorId: 'actor-1',
      eventType: 'LOGIN',
      limit: 20,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('derives nextCursor from the lookahead row', async () => {
    auditLog.list.mockResolvedValue([
      makeAuditLog({ id: 'a-1' }),
      makeAuditLog({ id: 'a-2' }),
    ]);

    const page = await useCase.execute({ actorId: 'actor-1', limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('a-1');
  });
});
