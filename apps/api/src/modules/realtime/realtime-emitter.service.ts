import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { userRoom } from './user-room';

// The io Server instance only exists once RealtimeGateway.afterInit() runs, so this
// service starts server-less; RealtimeGateway pushes the instance in via setServer().
@Injectable()
export class RealtimeEmitter {
  private server?: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }
}
