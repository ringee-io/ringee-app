import { Global, Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { RealtimeBusService } from "./realtime-bus.service";
import { RealtimePresenceService } from "./realtime-presence.service";
import { RealtimeUserEventsPublisher } from "./user-events.publisher";

/**
 * Transport-only module: the Redis fan-out, the presence registry and the typed
 * publisher. It holds no sockets — the WebSocket server lives in the API app so
 * only that process binds one (the orchestrator imports the same services just
 * to publish).
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    RealtimeBusService,
    RealtimePresenceService,
    RealtimeUserEventsPublisher,
  ],
  exports: [
    RealtimeBusService,
    RealtimePresenceService,
    RealtimeUserEventsPublisher,
  ],
})
export class RealtimeModule {}
