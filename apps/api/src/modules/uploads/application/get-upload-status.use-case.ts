import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  UploadPartRecord,
  UploadSession,
} from '../domain/upload-session.entity';
import {
  UPLOAD_REPOSITORY,
  type UploadRepository,
} from '../domain/upload.repository';

export interface UploadStatusResult {
  session: UploadSession;
  parts: UploadPartRecord[];
}

@Injectable()
export class GetUploadStatusUseCase {
  constructor(
    @Inject(UPLOAD_REPOSITORY) private readonly uploads: UploadRepository,
  ) {}

  async execute(
    uploadId: string,
    ownerId: string,
  ): Promise<UploadStatusResult> {
    const session = await this.uploads.findById(uploadId, ownerId);
    if (!session) {
      throw new NotFoundException('Upload not found');
    }
    const parts = await this.uploads.listParts(session.id);
    return { session, parts };
  }
}
