import { ClerkClient, createClerkClient } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { EnvConfig } from '../../../config/env.validation';

export const CLERK_CLIENT = Symbol('CLERK_CLIENT');

export const ClerkClientProvider: Provider = {
  provide: CLERK_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>): ClerkClient =>
    createClerkClient({
      secretKey: config.get('CLERK_SECRET_KEY', { infer: true }),
    }),
};
