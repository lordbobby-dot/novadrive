import { RealtimeEmitter } from './realtime-emitter.service';
import { userRoom } from './user-room';

describe('RealtimeEmitter', () => {
  it('is a no-op when no server has been set yet', () => {
    const emitter = new RealtimeEmitter();
    expect(() =>
      emitter.emitToUser('user-1', 'notification', {}),
    ).not.toThrow();
  });

  it('emits to the recipient user room once a server is set', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const emitter = new RealtimeEmitter();

    emitter.setServer({ to } as never);
    emitter.emitToUser('user-1', 'notification:new', { id: 'n-1' });

    expect(to).toHaveBeenCalledWith(userRoom('user-1'));
    expect(emit).toHaveBeenCalledWith('notification:new', { id: 'n-1' });
  });
});
