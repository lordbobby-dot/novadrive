import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthenticateWithClerkTokenUseCase } from '../auth/application/authenticate-with-clerk-token.use-case';
import { RealtimeEmitter } from './realtime-emitter.service';
import { userRoom } from './user-room';

interface SocketData {
  userId?: string;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

// Socket.io CORS options are read by the decorator before Nest's DI container exists,
// so this reads the env var directly rather than going through ConfigService (mirrors
// the CORS_ORIGIN default in env.validation.ts).
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly authenticate: AuthenticateWithClerkTokenUseCase,
    private readonly realtimeEmitter: RealtimeEmitter,
  ) {}

  afterInit(server: Server): void {
    this.realtimeEmitter.setServer(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.debug(`Rejecting socket ${client.id}: no token supplied`);
      client.disconnect(true);
      return;
    }

    try {
      const user = await this.authenticate.execute(token);
      client.data.userId = user.id;
      await client.join(userRoom(user.id));
    } catch {
      this.logger.debug(`Rejecting socket ${client.id}: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: AuthenticatedSocket): void {
    // No per-connection state to clean up: room membership is torn down
    // automatically by Socket.io on disconnect.
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) {
      return fromAuth;
    }
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return null;
  }
}
