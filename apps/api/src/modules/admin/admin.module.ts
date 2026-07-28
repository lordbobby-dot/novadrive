import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { QuotaModule } from '../quota/quota.module';
import { AuditModule } from '../audit/audit.module';
import { DependencyHealthModule } from '../../infrastructure/health/dependency-health.module';
import { CHECKSUM_VERIFICATION_QUEUE } from '../uploads/infrastructure/checksum-verification.queue';
import { TRASH_CLEANUP_QUEUE } from '../trash/infrastructure/trash-cleanup.queue';
import { AdminGuard } from './interface/admin.guard';
import { ListAdminUsersUseCase } from './application/list-admin-users.use-case';
import { SuspendUserUseCase } from './application/suspend-user.use-case';
import { UnsuspendUserUseCase } from './application/unsuspend-user.use-case';
import { SetSystemAdminUseCase } from './application/set-system-admin.use-case';
import { SetUserQuotaUseCase } from './application/set-user-quota.use-case';
import { ListAdminOrganizationsUseCase } from './application/list-admin-organizations.use-case';
import { GetAdminOrganizationDetailUseCase } from './application/get-admin-organization-detail.use-case';
import { SetOrganizationQuotaUseCase } from './application/set-organization-quota.use-case';
import { TransferOrganizationOwnershipUseCase } from './application/transfer-organization-ownership.use-case';
import { AdminDeleteOrganizationUseCase } from './application/admin-delete-organization.use-case';
import { AdminChangeMemberRoleUseCase } from './application/admin-change-member-role.use-case';
import { AdminRemoveOrganizationMemberUseCase } from './application/admin-remove-organization-member.use-case';
import { ListAdminAuditLogUseCase } from './application/list-admin-audit-log.use-case';
import { GetSystemHealthUseCase } from './application/get-system-health.use-case';
import { GetAdminAnalyticsUseCase } from './application/get-admin-analytics.use-case';
import { AdminUsersController } from './interface/admin-users.controller';
import { AdminOrganizationsController } from './interface/admin-organizations.controller';
import { AdminAuditLogController } from './interface/admin-audit-log.controller';
import { AdminSystemHealthController } from './interface/admin-system-health.controller';
import { AdminAnalyticsController } from './interface/admin-analytics.controller';

/** No domain/infrastructure layers of its own — every repository AdminModule needs
 * (User/Organization/StorageQuota/AuditLog) already lives in and is exported by its owning
 * module; this module is purely application (admin-specific use cases) + interface
 * (admin-gated controllers). Registers the two existing named queues a second time (same
 * underlying Redis connection/queue name — see checksum-verification.queue.ts/
 * trash-cleanup.queue.ts) purely to read connectivity/depth for system-health, without pulling
 * in UploadsModule/TrashModule's much larger dependency trees. DependencyHealthModule supplies
 * the shared Postgres/Redis/S3 up/down checks (see docs/observability.md) that GET /health/ready
 * also uses — GetSystemHealthUseCase only adds the per-queue depth on top. */
@Module({
  imports: [
    UsersModule,
    OrganizationsModule,
    QuotaModule,
    AuditModule,
    DependencyHealthModule,
    BullModule.registerQueue(
      { name: CHECKSUM_VERIFICATION_QUEUE },
      { name: TRASH_CLEANUP_QUEUE },
    ),
  ],
  controllers: [
    AdminUsersController,
    AdminOrganizationsController,
    AdminAuditLogController,
    AdminSystemHealthController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminGuard,
    { provide: APP_GUARD, useClass: AdminGuard },
    ListAdminUsersUseCase,
    SuspendUserUseCase,
    UnsuspendUserUseCase,
    SetSystemAdminUseCase,
    SetUserQuotaUseCase,
    ListAdminOrganizationsUseCase,
    GetAdminOrganizationDetailUseCase,
    SetOrganizationQuotaUseCase,
    TransferOrganizationOwnershipUseCase,
    AdminDeleteOrganizationUseCase,
    AdminChangeMemberRoleUseCase,
    AdminRemoveOrganizationMemberUseCase,
    ListAdminAuditLogUseCase,
    GetSystemHealthUseCase,
    GetAdminAnalyticsUseCase,
  ],
})
export class AdminModule {}
