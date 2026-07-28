import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { VersionsModule } from '../versions/versions.module';
import { StorageModule } from '../storage/storage.module';
import { QuotaModule } from '../quota/quota.module';
import { TRASH_REPOSITORY } from './domain/trash.repository';
import { PrismaTrashRepository } from './infrastructure/prisma-trash.repository';
import { TRASH_CLEANUP_QUEUE } from './infrastructure/trash-cleanup.queue';
import { TrashCleanupProcessor } from './infrastructure/trash-cleanup.processor';
import { TrashCleanupScheduler } from './infrastructure/trash-cleanup.scheduler';
import { ListTrashUseCase } from './application/list-trash.use-case';
import { RestoreFileUseCase } from './application/restore-file.use-case';
import { RestoreFolderUseCase } from './application/restore-folder.use-case';
import { PermanentDeleteFileUseCase } from './application/permanent-delete-file.use-case';
import { PermanentDeleteFolderUseCase } from './application/permanent-delete-folder.use-case';
import { PermanentDeleteUseCase } from './application/permanent-delete.use-case';
import { PurgeExpiredTrashUseCase } from './application/purge-expired-trash.use-case';
import { TrashController } from './interface/trash.controller';
import { RestoreController } from './interface/restore.controller';

@Module({
  imports: [
    FoldersModule,
    FilesModule,
    VersionsModule,
    StorageModule,
    QuotaModule,
    BullModule.registerQueue({ name: TRASH_CLEANUP_QUEUE }),
  ],
  controllers: [TrashController, RestoreController],
  providers: [
    { provide: TRASH_REPOSITORY, useClass: PrismaTrashRepository },
    ListTrashUseCase,
    RestoreFileUseCase,
    RestoreFolderUseCase,
    PermanentDeleteFileUseCase,
    PermanentDeleteFolderUseCase,
    PermanentDeleteUseCase,
    PurgeExpiredTrashUseCase,
    TrashCleanupProcessor,
    TrashCleanupScheduler,
  ],
})
export class TrashModule {}
