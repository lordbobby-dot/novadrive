import { Module } from '@nestjs/common';
import { RealtimeEmitter } from './realtime-emitter.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, RealtimeEmitter],
  exports: [RealtimeEmitter],
})
export class RealtimeModule {}
