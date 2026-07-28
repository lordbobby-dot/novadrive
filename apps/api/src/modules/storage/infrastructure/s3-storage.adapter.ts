import { Inject, Injectable } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CompletedPartInput,
  PresignedPart,
  StorageAdapter,
} from '../domain/storage-adapter';
import { S3_CLIENT } from './s3-client.provider';

const PRESIGNED_PART_URL_TTL_SECONDS = 60 * 15;
const PRESIGNED_DOWNLOAD_URL_TTL_SECONDS = 60 * 5;

function buildContentDisposition(
  disposition: 'attachment' | 'inline',
  fileName: string,
): string {
  // RFC 5987 filename* covers non-ASCII names; the plain `filename` fallback (ASCII-only,
  // quotes/backslashes stripped) is for older clients that don't understand filename*.
  const asciiFallback = fileName
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  constructor(@Inject(S3_CLIENT) private readonly s3: S3Client) {}

  async createMultipartUpload(params: {
    bucket: string;
    objectKey: string;
    contentType: string;
  }): Promise<{ uploadId: string }> {
    const result = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: params.bucket,
        Key: params.objectKey,
        ContentType: params.contentType,
      }),
    );
    if (!result.UploadId) {
      throw new Error(
        'S3 did not return an UploadId for CreateMultipartUpload',
      );
    }
    return { uploadId: result.UploadId };
  }

  async presignUploadParts(params: {
    bucket: string;
    objectKey: string;
    uploadId: string;
    partNumbers: number[];
  }): Promise<PresignedPart[]> {
    return Promise.all(
      params.partNumbers.map(async (partNumber) => {
        const command = new UploadPartCommand({
          Bucket: params.bucket,
          Key: params.objectKey,
          UploadId: params.uploadId,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(this.s3, command, {
          expiresIn: PRESIGNED_PART_URL_TTL_SECONDS,
        });
        return { partNumber, url };
      }),
    );
  }

  async completeMultipartUpload(params: {
    bucket: string;
    objectKey: string;
    uploadId: string;
    parts: CompletedPartInput[];
  }): Promise<{ eTag: string }> {
    const result = await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: params.bucket,
        Key: params.objectKey,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: params.parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ ETag: part.eTag, PartNumber: part.partNumber })),
        },
      }),
    );
    if (!result.ETag) {
      throw new Error('S3 did not return an ETag for CompleteMultipartUpload');
    }
    return { eTag: result.ETag };
  }

  async abortMultipartUpload(params: {
    bucket: string;
    objectKey: string;
    uploadId: string;
  }): Promise<void> {
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: params.bucket,
        Key: params.objectKey,
        UploadId: params.uploadId,
      }),
    );
  }

  async getObjectStream(params: {
    bucket: string;
    objectKey: string;
  }): Promise<NodeJS.ReadableStream> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: params.bucket, Key: params.objectKey }),
    );
    if (!result.Body) {
      throw new Error('S3 did not return a Body for GetObject');
    }
    return result.Body as NodeJS.ReadableStream;
  }

  async deleteObject(params: {
    bucket: string;
    objectKey: string;
  }): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: params.bucket, Key: params.objectKey }),
    );
  }

  async presignGetObject(params: {
    bucket: string;
    objectKey: string;
    disposition: 'attachment' | 'inline';
    fileName: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const command = new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.objectKey,
      ResponseContentDisposition: buildContentDisposition(
        params.disposition,
        params.fileName,
      ),
      ResponseContentType: params.contentType,
    });
    const url = await getSignedUrl(this.s3, command, {
      expiresIn: PRESIGNED_DOWNLOAD_URL_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: new Date(
        Date.now() + PRESIGNED_DOWNLOAD_URL_TTL_SECONDS * 1000,
      ),
    };
  }

  async copyObject(params: {
    sourceBucket: string;
    sourceObjectKey: string;
    destinationBucket: string;
    destinationObjectKey: string;
  }): Promise<{ eTag: string }> {
    const result = await this.s3.send(
      new CopyObjectCommand({
        CopySource: `${params.sourceBucket}/${params.sourceObjectKey}`,
        Bucket: params.destinationBucket,
        Key: params.destinationObjectKey,
      }),
    );
    if (!result.CopyObjectResult?.ETag) {
      throw new Error('S3 did not return an ETag for CopyObject');
    }
    return { eTag: result.CopyObjectResult.ETag };
  }
}
