import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

/** `EventEmitterModule.forRoot()` is `@Global()` internally, so importing it once here (and
 * importing this module once in AppModule) makes `EventEmitter2` injectable everywhere without
 * every feature module having to import it individually — mirrors how QueueModule wraps
 * `BullModule.forRootAsync`. */
@Module({
  imports: [EventEmitterModule.forRoot()],
  exports: [EventEmitterModule],
})
export class DomainEventsModule {}
