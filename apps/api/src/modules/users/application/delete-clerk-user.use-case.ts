import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/user.repository';

@Injectable()
export class DeleteClerkUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  execute(clerkId: string): Promise<void> {
    return this.users.deleteByClerkId(clerkId);
  }
}
