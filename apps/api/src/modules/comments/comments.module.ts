import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module';
import { UsersModule } from '../users/users.module';
import { COMMENT_REPOSITORY } from './domain/comment.repository';
import { PrismaCommentRepository } from './infrastructure/prisma-comment.repository';
import { CreateCommentUseCase } from './application/create-comment.use-case';
import { ListCommentsUseCase } from './application/list-comments.use-case';
import { ResolveCommentUseCase } from './application/resolve-comment.use-case';
import { DeleteCommentUseCase } from './application/delete-comment.use-case';
import { CommentsController } from './interface/comments.controller';

@Module({
  imports: [SharingModule, UsersModule],
  controllers: [CommentsController],
  providers: [
    { provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository },
    CreateCommentUseCase,
    ListCommentsUseCase,
    ResolveCommentUseCase,
    DeleteCommentUseCase,
  ],
})
export class CommentsModule {}
