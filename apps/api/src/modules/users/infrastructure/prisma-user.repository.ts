import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ClerkUserAttributes, User } from '../domain/user.entity';
import { ListUsersParams, UserRepository } from '../domain/user.repository';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByClerkId(clerkId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { clerkId } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({ where: { id: { in: ids } } });
  }

  upsertFromClerk(attributes: ClerkUserAttributes): Promise<User> {
    return this.prisma.user.upsert({
      where: { clerkId: attributes.clerkId },
      create: attributes,
      update: {
        email: attributes.email,
        name: attributes.name,
        avatarUrl: attributes.avatarUrl,
      },
    });
  }

  async deleteByClerkId(clerkId: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { clerkId } });
  }

  list(params: ListUsersParams): Promise<User[]> {
    const { search, cursor, limit } = params;
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  setSystemAdmin(id: string, isSystemAdmin: boolean): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isSystemAdmin } });
  }

  setSuspended(id: string, isSuspended: boolean): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isSuspended, suspendedAt: isSuspended ? new Date() : null },
    });
  }
}
