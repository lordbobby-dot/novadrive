import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { STORAGE_QUOTA_REPOSITORY } from './domain/storage-quota.repository';
import { PrismaStorageQuotaRepository } from './infrastructure/prisma-storage-quota.repository';
import { QuotaService } from './domain/quota.service';
import { GetQuotaUseCase } from './application/get-quota.use-case';
import { QuotaController } from './interface/quota.controller';

@Module({
  imports: [OrganizationsModule],
  controllers: [QuotaController],
  providers: [
    {
      provide: STORAGE_QUOTA_REPOSITORY,
      useClass: PrismaStorageQuotaRepository,
    },
    QuotaService,
    GetQuotaUseCase,
  ],
  exports: [STORAGE_QUOTA_REPOSITORY, QuotaService],
})
export class QuotaModule {}
