import { ApiProperty } from '@nestjs/swagger';
import type { Comment } from '../../domain/comment.entity';
import type { CommentWithAuthor } from '../../application/list-comments.use-case';

export class CommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['FILE', 'FOLDER'] })
  resourceType!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty()
  authorId!: string;

  @ApiProperty({ nullable: true })
  authorEmail!: string | null;

  @ApiProperty({ nullable: true })
  authorName!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  resolved!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(comment: Comment): CommentResponseDto {
    const dto = new CommentResponseDto();
    dto.id = comment.id;
    dto.resourceType = comment.resourceType;
    dto.resourceId = comment.resourceId;
    dto.authorId = comment.authorId;
    dto.authorEmail = null;
    dto.authorName = null;
    dto.body = comment.body;
    dto.resolved = comment.resolved;
    dto.createdAt = comment.createdAt;
    dto.updatedAt = comment.updatedAt;
    return dto;
  }

  static fromDomainWithAuthor(entry: CommentWithAuthor): CommentResponseDto {
    const dto = CommentResponseDto.fromDomain(entry.comment);
    dto.authorEmail = entry.authorEmail;
    dto.authorName = entry.authorName;
    return dto;
  }
}
