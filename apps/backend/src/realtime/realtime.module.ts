import { Module } from "@nestjs/common";
import { RealtimeModule as RealtimePlatformModule } from "@ringee/platform";
import { UserEventsGateway } from "./user-events.gateway";

/**
 * Hosts the per-user WebSocket server. It lives in the API app (not in the
 * shared `ServicesModule`) so only the process that owns the public HTTP server
 * accepts upgrades — the orchestrator imports the platform transport alone and
 * just publishes.
 */
@Module({
  imports: [RealtimePlatformModule],
  providers: [UserEventsGateway],
  exports: [UserEventsGateway],
})
export class BackendRealtimeModule {}
