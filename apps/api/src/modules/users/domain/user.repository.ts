import { ClerkUserAttributes, User } from './user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface ListUsersParams {
  /** Case-insensitive partial match against email or name. */
  search?: string;
  cursor?: string;
  limit: number;
}

export interface UserRepository {
  findByClerkId(clerkId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Case-insensitive — used to resolve an invitation's target email to an existing local
   * account, e.g. so an in-app notification can be sent alongside the invitation email. */
  findByEmail(email: string): Promise<User | null>;
  /** Batched lookup — used to resolve a Permission list's subjectIds to display names/emails in
   * one round trip rather than one per collaborator. */
  findByIds(ids: string[]): Promise<User[]>;
  upsertFromClerk(attributes: ClerkUserAttributes): Promise<User>;
  deleteByClerkId(clerkId: string): Promise<void>;
  /** Admin-wide listing (every user on the platform), not scoped to any actor — see AdminModule.
   * Returns `limit + 1` rows (caller derives the next cursor from the lookahead row). */
  list(params: ListUsersParams): Promise<User[]>;
  setSystemAdmin(id: string, isSystemAdmin: boolean): Promise<User>;
  setSuspended(id: string, isSuspended: boolean): Promise<User>;
}
