import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrganizationMember } from '../domain/organization-member.entity';
import {
  OrganizationMemberRepository,
  UpsertOrganizationMemberParams,
} from '../domain/organization-member.repository';

@Injectable()
export class PrismaOrganizationMemberRepository implements OrganizationMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(params: UpsertOrganizationMemberParams): Promise<OrganizationMember> {
    return this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: params.organizationId,
          userId: params.userId,
        },
      },
      create: params,
      update: { role: params.role },
    });
  }

  findByOrgAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    return this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  listForOrganization(organizationId: string): Promise<OrganizationMember[]> {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  listForUser(userId: string): Promise<OrganizationMember[]> {
    return this.prisma.organizationMember.findMany({ where: { userId } });
  }

  async remove(organizationId: string, userId: string): Promise<void> {
    await this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }
}
