import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AuthenticateWithClerkTokenUseCase } from './application/authenticate-with-clerk-token.use-case';
import { ClerkClientProvider } from './infrastructure/clerk-client.provider';
import { ClerkAuthGuard } from './interface/clerk-auth.guard';
import { ClerkWebhookController } from './interface/clerk-webhook.controller';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [ClerkWebhookController],
  providers: [
    ClerkClientProvider,
    AuthenticateWithClerkTokenUseCase,
    ClerkAuthGuard,
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
  ],
  exports: [
    ClerkClientProvider,
    AuthenticateWithClerkTokenUseCase,
    ClerkAuthGuard,
  ],
})
export class AuthModule {}
