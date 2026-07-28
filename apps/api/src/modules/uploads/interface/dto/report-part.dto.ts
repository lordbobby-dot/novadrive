import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsString,
  Min,
} from 'class-validator';

export class ReportPartDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  partNumber!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  eTag!: string;

  @ApiProperty({ description: 'Part size in bytes, as a string' })
  @IsNumberString()
  size!: string;
}
