import { DeleteClerkUserUseCase } from './delete-clerk-user.use-case';
import type { UserRepository } from '../domain/user.repository';

describe('DeleteClerkUserUseCase', () => {
  let users: jest.Mocked<UserRepository>;
  let useCase: DeleteClerkUserUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      findByClerkId: jest.fn(),
      findByEmail: jest.fn(),
      findByIds: jest.fn(),
      upsertFromClerk: jest.fn(),
      deleteByClerkId: jest.fn(),
      list: jest.fn(),
      setSystemAdmin: jest.fn(),
      setSuspended: jest.fn(),
    };
    useCase = new DeleteClerkUserUseCase(users);
  });

  it('delegates straight to deleteByClerkId', async () => {
    users.deleteByClerkId.mockResolvedValue(undefined);

    await useCase.execute('clerk-1');

    expect(users.deleteByClerkId).toHaveBeenCalledWith('clerk-1');
  });
});
