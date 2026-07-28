import { Injectable } from '@nestjs/common';
import type { Invitation as PrismaInvitation } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import type {
  Invitation,
  InvitationStatusName,
} from '../domain/invitation.entity';
import {
  CreateInvitationParams,
  InvitationRepository,
} from '../domain/invitation.repository';

function toDomain(row: PrismaInvitation): Invitation {
  return {
    id: row.id,
    email: row.email,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    role: row.role,
    token: row.token,
    invitedBy: row.invitedBy,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateInvitationParams): Promise<Invitation> {
    const row = await this.prisma.invitation.create({ data: params });
    return toDomain(row);
  }

  async findById(id: string): Promise<Invitation | null> {
    const row = await this.prisma.invitation.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByToken(token: string): Promise<Invitation | null> {
    const row = await this.prisma.invitation.findUnique({ where: { token } });
    return row ? toDomain(row) : null;
  }

  async updateStatus(id: string, status: InvitationStatusName): Promise<void> {
    await this.prisma.invitation.update({ where: { id }, data: { status } });
  }

  async listForResource(
    resourceType: ResourceTypeName,
    resourceId: string,
  ): Promise<Invitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }
}
