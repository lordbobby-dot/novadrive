import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import type { ClerkUserAttributes, User } from '../domain/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../domain/user.repository';

@Injectable()
export class SyncClerkUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async execute(attributes: ClerkUserAttributes): Promise<User> {
    const user = await this.users.upsertFromClerk(attributes);

    // Bootstraps the very first admin(s) — grants only, never revokes, so demoting/promoting
    // through the admin panel later is never silently undone by an unrelated Clerk sync. See
    // ADMIN_BOOTSTRAP_EMAILS in env.validation.ts.
    const bootstrapEmails = this.config.get('ADMIN_BOOTSTRAP_EMAILS', {
      infer: true,
    });
    if (
      !user.isSystemAdmin &&
      bootstrapEmails.includes(attributes.email.toLowerCase())
    ) {
      return this.users.setSystemAdmin(user.id, true);
    }

    return user;
  }
}
