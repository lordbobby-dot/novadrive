import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { ListTagsUseCase } from '../application/list-tags.use-case';
import { TagResponseDto } from './dto/tag-response.dto';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly listTags: ListTagsUseCase) {}

  @Get()
  @ApiOperation({
    summary: "List the current user's tags (for chip pickers/filters)",
  })
  async list(@CurrentUser() user: User): Promise<TagResponseDto[]> {
    const tags = await this.listTags.execute(user.id);
    return tags.map((tag) => TagResponseDto.fromDomain(tag));
  }
}
