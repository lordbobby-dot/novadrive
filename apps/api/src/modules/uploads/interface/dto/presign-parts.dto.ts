import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayNotEmpty, IsInt, Min } from 'class-validator';

export class PresignPartsDto {
  @ApiProperty({ type: [Number] })
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  partNumbers!: number[];
}
