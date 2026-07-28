import { AuditEvent } from '../../../common/events/audit.event';
import { AuditLogListener } from './audit-log.listener';
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

describe('AuditLogListener', () => {
  let auditLog: jest.Mocked<AuditLogRepository>;
  let listener: AuditLogListener;

  beforeEach(() => {
    auditLog = {
      create: jest.fn(),
      list: jest.fn(),
      deleteOlderThan: jest.fn(),
    };
    listener = new AuditLogListener(auditLog);
  });

  it('writes an AuditLog row for the event', async () => {
    auditLog.create.mockResolvedValue(makeAuditLog());

    await listener.handleAudit(
      new AuditEvent('LOGIN', 'SUCCESS', 'actor-1', undefined, undefined, {
        sessionId: 'sess-1',
      }),
    );

    expect(auditLog.create).toHaveBeenCalledWith({
      actorId: 'actor-1',
      eventType: 'LOGIN',
      outcome: 'SUCCESS',
      targetType: undefined,
      targetId: undefined,
      metadata: { sessionId: 'sess-1' },
      ipAddress: undefined,
      userAgent: undefined,
    });
  });

  it('accepts a null actorId (unresolved actor, e.g. a rejected auth token)', async () => {
    auditLog.create.mockResolvedValue(makeAuditLog({ actorId: null }));

    await listener.handleAudit(
      new AuditEvent('AUTH_TOKEN_REJECTED', 'FAILURE', null),
    );

    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null }),
    );
  });

  it('logs and swallows errors instead of throwing (fire-and-forget)', async () => {
    auditLog.create.mockRejectedValue(new Error('db unreachable'));

    await expect(
      listener.handleAudit(new AuditEvent('LOGIN', 'SUCCESS', 'actor-1')),
    ).resolves.toBeUndefined();
  });
});
