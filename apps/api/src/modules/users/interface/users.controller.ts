import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import type { User } from '../domain/user.entity';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly getCurrentUser: GetCurrentUserUseCase) {}

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated user's profile" })
  async me(@CurrentUser() user: User): Promise<UserResponseDto> {
    const current = await this.getCurrentUser.execute(user.id);
    return UserResponseDto.fromDomain(current);
  }
}
