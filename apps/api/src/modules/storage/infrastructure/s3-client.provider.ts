import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { EnvConfig } from '../../../config/env.validation';

export const S3_CLIENT = Symbol('S3_CLIENT');

export const S3ClientProvider: Provider = {
  provide: S3_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>): S3Client => {
    const region = config.get('AWS_REGION', { infer: true });
    const accessKeyId = config.get('AWS_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY', {
      infer: true,
    });

    return new S3Client({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  },
};
