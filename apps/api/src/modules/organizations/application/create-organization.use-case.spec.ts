import { CreateOrganizationUseCase } from './create-organization.use-case';
import type { OrganizationRepository } from '../domain/organization.repository';
import type { Organization } from '../domain/organization.entity';

describe('CreateOrganizationUseCase', () => {
  let organizations: jest.Mocked<OrganizationRepository>;
  let useCase: CreateOrganizationUseCase;

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
    useCase = new CreateOrganizationUseCase(organizations);
  });

  it('creates the organization with the caller as owner', async () => {
    const created: Organization = {
      id: 'org-1',
      name: 'Acme',
      ownerId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    organizations.create.mockResolvedValue(created);

    const result = await useCase.execute({ ownerId: 'owner-1', name: 'Acme' });

    expect(organizations.create).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      name: 'Acme',
    });
    expect(result).toBe(created);
  });
});
