import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { File } from '../domain/file.entity';
import {
  FILE_REPOSITORY,
  type FileRepository,
} from '../domain/file.repository';

@Injectable()
export class GetFileUseCase {
  constructor(
    @Inject(FILE_REPOSITORY) private readonly files: FileRepository,
  ) {}

  /** `ownerId` is unused now that PermissionGuard authorizes the request before this runs. */
  async execute(id: string, _ownerId: string): Promise<File> {
    const file = await this.files.findByIdUnscoped(id);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }
}
