import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ResolveCommentDto {
  @ApiProperty()
  @IsBoolean()
  resolved!: boolean;
}
