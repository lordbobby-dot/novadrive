import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class SetTagsDto {
  @ApiProperty({
    type: [String],
    description:
      'The complete tag set — replaces whatever tags were there before',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  names!: string[];
}
