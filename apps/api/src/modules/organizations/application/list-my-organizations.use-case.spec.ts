import { ListMyOrganizationsUseCase } from './list-my-organizations.use-case';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { OrganizationMemberRepository } from '../domain/organization-member.repository';
import type { Organization } from '../domain/organization.entity';

describe('ListMyOrganizationsUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let members: jest.Mocked<OrganizationMemberRepository>;
  let useCase: ListMyOrganizationsUseCase;

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
    members = {
      upsert: jest.fn(),
      findByOrgAndUser: jest.fn(),
      listForOrganization: jest.fn(),
      listForUser: jest.fn(),
      remove: jest.fn(),
    };
    useCase = new ListMyOrganizationsUseCase(organizations, members);
  });

  it('resolves OWNER for orgs the actor owns and the membership role for orgs they belong to', async () => {
    const owned: Organization = {
      id: 'org-owned',
      name: 'Mine',
      ownerId: 'actor-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const memberOf: Organization = {
      id: 'org-member',
      name: 'Theirs',
      ownerId: 'someone-else',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    organizations.listForActor.mockResolvedValue([owned, memberOf]);
    members.listForUser.mockResolvedValue([
      {
        id: 'm-1',
        organizationId: 'org-member',
        userId: 'actor-1',
        role: 'VIEWER',
        createdAt: new Date(),
      },
    ]);

    const result = await useCase.execute('actor-1');

    expect(result).toEqual([
      { organization: owned, myRole: 'OWNER' },
      { organization: memberOf, myRole: 'VIEWER' },
    ]);
  });
});
