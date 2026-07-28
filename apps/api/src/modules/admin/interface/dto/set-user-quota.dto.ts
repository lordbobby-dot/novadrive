import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class SetUserQuotaDto {
  @ApiProperty({
    description:
      'New storage limit in bytes, as a decimal string (large enough to exceed Number.MAX_SAFE_INTEGER for some deployments). Must be a positive integer.',
  })
  @IsNumberString({ no_symbols: true })
  limitBytes!: string;
}
