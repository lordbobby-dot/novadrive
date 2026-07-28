import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { SyncClerkUserUseCase } from './application/sync-clerk-user.use-case';
import { DeleteClerkUserUseCase } from './application/delete-clerk-user.use-case';
import { UsersController } from './interface/users.controller';

@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    GetCurrentUserUseCase,
    SyncClerkUserUseCase,
    DeleteClerkUserUseCase,
  ],
  exports: [
    USER_REPOSITORY,
    GetCurrentUserUseCase,
    SyncClerkUserUseCase,
    DeleteClerkUserUseCase,
  ],
})
export class UsersModule {}
