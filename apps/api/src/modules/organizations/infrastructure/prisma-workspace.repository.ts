import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Workspace } from '../domain/workspace.entity';
import {
  CreateWorkspaceParams,
  WorkspaceRepository,
} from '../domain/workspace.repository';

@Injectable()
export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateWorkspaceParams): Promise<Workspace> {
    return this.prisma.workspace.create({ data: params });
  }

  findById(id: string): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({ where: { id } });
  }

  listForOrganization(organizationId: string): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  rename(id: string, name: string): Promise<Workspace> {
    return this.prisma.workspace.update({ where: { id }, data: { name } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspace.delete({ where: { id } });
  }
}
