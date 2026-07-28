import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Organization } from '../domain/organization.entity';
import {
  CreateOrganizationParams,
  ListOrganizationsParams,
  OrganizationRepository,
  OrganizationWithCounts,
} from '../domain/organization.repository';

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateOrganizationParams): Promise<Organization> {
    return this.prisma.organization.create({ data: params });
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  listForActor(actorId: string): Promise<Organization[]> {
    return this.prisma.organization.findMany({
      where: {
        OR: [{ ownerId: actorId }, { members: { some: { userId: actorId } } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAll(
    params: ListOrganizationsParams,
  ): Promise<OrganizationWithCounts[]> {
    const { search, cursor, limit } = params;
    const rows = await this.prisma.organization.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { members: true, workspaces: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.ownerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      memberCount: row._count.members + 1,
      workspaceCount: row._count.workspaces,
    }));
  }

  rename(id: string, name: string): Promise<Organization> {
    return this.prisma.organization.update({ where: { id }, data: { name } });
  }

  transferOwnership(id: string, newOwnerId: string): Promise<Organization> {
    return this.prisma.organization.update({
      where: { id },
      data: { ownerId: newOwnerId },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organization.delete({ where: { id } });
  }
}
