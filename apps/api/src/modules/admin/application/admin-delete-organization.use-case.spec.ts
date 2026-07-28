import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminDeleteOrganizationUseCase } from './admin-delete-organization.use-case';
import type { OrganizationRepository } from '../../organizations/domain/organization.repository';
import type { Organization } from '../../organizations/domain/organization.entity';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Acme',
    ownerId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdminDeleteOrganizationUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let events: jest.Mocked<EventEmitter2>;
  let useCase: AdminDeleteOrganizationUseCase;

  beforeEach(() => {
    organizations = {
      create: jest.fn(),
      findById: jest.fn(),
      listForActor: jest.fn(),
      listAll: jest.fn(),
      rename: jest.fn(),
      transferOwnership: jest.fn(),
      delete: jest.fn(),
    };
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    useCase = new AdminDeleteOrganizationUseCase(organizations, events);
  });

  it('throws NotFoundException for an unknown organization', async () => {
    organizations.findById.mockResolvedValue(null);
    await expect(useCase.execute('admin-1', 'org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(organizations.delete).not.toHaveBeenCalled();
  });

  it('deletes the organization regardless of who owns it and audits ORGANIZATION_DELETED', async () => {
    organizations.findById.mockResolvedValue(
      makeOrg({ ownerId: 'someone-else' }),
    );

    await useCase.execute('admin-1', 'org-1');

    expect(organizations.delete).toHaveBeenCalledWith('org-1');
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORGANIZATION_DELETED',
        actorId: 'admin-1',
        targetId: 'org-1',
      }),
    );
    const [, auditEvent] = events.emit.mock.calls[0] as [
      string,
      { metadata?: { ownerId?: string } },
    ];
    expect(auditEvent.metadata?.ownerId).toBe('someone-else');
  });
});
