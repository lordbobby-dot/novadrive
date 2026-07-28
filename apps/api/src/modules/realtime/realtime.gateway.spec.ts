import { UnauthorizedException } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEmitter } from './realtime-emitter.service';
import { userRoom } from './user-room';
import type { AuthenticateWithClerkTokenUseCase } from '../auth/application/authenticate-with-clerk-token.use-case';
import type { User } from '../users/domain/user.entity';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let authenticate: jest.Mocked<AuthenticateWithClerkTokenUseCase>;
  let emitter: RealtimeEmitter;

  const localUser: User = {
    id: 'user-1',
    clerkId: 'clerk-1',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    isSystemAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function mockSocket(opts: {
    auth?: Record<string, unknown>;
    authorizationHeader?: string;
  }) {
    return {
      id: 'socket-1',
      data: {} as { userId?: string },
      handshake: {
        auth: opts.auth ?? {},
        headers: opts.authorizationHeader
          ? { authorization: opts.authorizationHeader }
          : {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
  }

  beforeEach(() => {
    authenticate = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AuthenticateWithClerkTokenUseCase>;
    emitter = new RealtimeEmitter();
    gateway = new RealtimeGateway(authenticate, emitter);
  });

  it('disconnects a socket with no token', async () => {
    const socket = mockSocket({});

    await gateway.handleConnection(socket as never);

    expect(authenticate.execute).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket whose token fails verification', async () => {
    authenticate.execute.mockRejectedValue(
      new UnauthorizedException('Invalid or expired token'),
    );
    const socket = mockSocket({ auth: { token: 'bad-token' } });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins the per-user room for a socket with a valid handshake token', async () => {
    authenticate.execute.mockResolvedValue(localUser);
    const socket = mockSocket({ auth: { token: 'good-token' } });

    await gateway.handleConnection(socket as never);

    expect(authenticate.execute).toHaveBeenCalledWith('good-token');
    expect(socket.join).toHaveBeenCalledWith(userRoom('user-1'));
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.userId).toBe('user-1');
  });

  it('falls back to the Authorization header when no auth.token is supplied', async () => {
    authenticate.execute.mockResolvedValue(localUser);
    const socket = mockSocket({ authorizationHeader: 'Bearer good-token' });

    await gateway.handleConnection(socket as never);

    expect(authenticate.execute).toHaveBeenCalledWith('good-token');
    expect(socket.join).toHaveBeenCalledWith(userRoom('user-1'));
  });

  it('pushes the io server into RealtimeEmitter on afterInit', () => {
    const server = { to: jest.fn() };
    const setServerSpy = jest.spyOn(emitter, 'setServer');

    gateway.afterInit(server as never);

    expect(setServerSpy).toHaveBeenCalledWith(server);
  });
});
