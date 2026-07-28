import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import type { ResourceTypeName } from '../../sharing/domain/permission.entity';
import { CreateCommentUseCase } from '../application/create-comment.use-case';
import { ListCommentsUseCase } from '../application/list-comments.use-case';
import { ResolveCommentUseCase } from '../application/resolve-comment.use-case';
import { DeleteCommentUseCase } from '../application/delete-comment.use-case';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ResolveCommentDto } from './dto/resolve-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

@ApiTags('comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(
    private readonly createComment: CreateCommentUseCase,
    private readonly listComments: ListCommentsUseCase,
    private readonly resolveComment: ResolveCommentUseCase,
    private readonly deleteComment: DeleteCommentUseCase,
  ) {}

  @Post('comments')
  @ApiOperation({ summary: 'Add a comment to a file or folder' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    const comment = await this.createComment.execute(
      user.id,
      dto.resourceType,
      dto.resourceId,
      dto.body,
    );
    return CommentResponseDto.fromDomain(comment);
  }

  @Get('resources/:type/:id/comments')
  @ApiOperation({ summary: 'List comments on a file or folder' })
  async list(
    @CurrentUser() user: User,
    @Param('type') type: string,
    @Param('id') id: string,
  ): Promise<CommentResponseDto[]> {
    const resourceType = type.toUpperCase() as ResourceTypeName;
    const comments = await this.listComments.execute(user.id, resourceType, id);
    return comments.map((entry) =>
      CommentResponseDto.fromDomainWithAuthor(entry),
    );
  }

  @Patch('comments/:id/resolve')
  @ApiOperation({ summary: 'Mark a comment resolved or unresolved' })
  async resolve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ResolveCommentDto,
  ): Promise<CommentResponseDto> {
    const comment = await this.resolveComment.execute(
      user.id,
      id,
      dto.resolved,
    );
    return CommentResponseDto.fromDomain(comment);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a comment' })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteComment.execute(user.id, id);
  }
}
