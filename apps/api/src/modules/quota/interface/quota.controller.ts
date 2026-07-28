import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { GetQuotaUseCase } from '../application/get-quota.use-case';
import { QuotaResponseDto } from './dto/quota-response.dto';

@ApiTags('quota')
@ApiBearerAuth()
@Controller()
export class QuotaController {
  constructor(private readonly getQuota: GetQuotaUseCase) {}

  @Get('quota')
  @ApiOperation({
    summary:
      "Get the caller's personal storage usage, limit, and breakdown by type",
  })
  async personal(@CurrentUser() user: User): Promise<QuotaResponseDto> {
    const result = await this.getQuota.execute(user.id, 'USER', user.id);
    return QuotaResponseDto.fromDomain(result);
  }

  @Get('organizations/:id/quota')
  @ApiOperation({
    summary:
      "Get an organization's shared storage usage, limit, and breakdown by type (VIEWER+)",
  })
  async organization(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<QuotaResponseDto> {
    const result = await this.getQuota.execute(user.id, 'ORGANIZATION', id);
    return QuotaResponseDto.fromDomain(result);
  }
}
