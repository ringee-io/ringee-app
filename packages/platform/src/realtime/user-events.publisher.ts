import { Injectable } from "@nestjs/common";
import { RealtimeBusService } from "./realtime-bus.service";
import {
  RealtimeAccountBlockedEvent,
  RealtimeAccountRestoredEvent,
  RealtimeBroadcastEvent,
  RealtimeCallsTerminatedEvent,
  RealtimeUserEnvelope,
  USER_EVENTS_CHANNEL,
} from "./realtime.contracts";

/**
 * Typed entry point for pushing an event to every device a user has online.
 *
 * Callers never touch Redis or the socket registry directly: they state the
 * intent ("this account is blocked") and the gateway on each API instance
 * decides how to deliver it.
 */
@Injectable()
export class RealtimeUserEventsPublisher {
  constructor(private readonly bus: RealtimeBusService) {}

  /** Ban/lockdown: every device must hang up, wipe state and sign out. */
  accountBlocked(
    userId: string,
    event: Omit<RealtimeAccountBlockedEvent, "type">,
  ): Promise<void> {
    return this.broadcast(userId, { type: "account.blocked", ...event });
  }

  /** Live calls were dropped by an admin without banning the account. */
  callsTerminated(
    userId: string,
    event: Omit<RealtimeCallsTerminatedEvent, "type">,
  ): Promise<void> {
    return this.broadcast(userId, { type: "calls.terminated", ...event });
  }

  /** The block was lifted; devices may resume. */
  accountRestored(
    userId: string,
    event?: Partial<Omit<RealtimeAccountRestoredEvent, "type">>,
  ): Promise<void> {
    return this.broadcast(userId, {
      type: "account.restored",
      at: event?.at ?? new Date().toISOString(),
    });
  }

  private broadcast(
    userId: string,
    event: RealtimeBroadcastEvent,
  ): Promise<void> {
    const envelope: RealtimeUserEnvelope = {
      userId,
      event,
      publishedAt: new Date().toISOString(),
    };
    return this.bus.publish(USER_EVENTS_CHANNEL, envelope);
  }
}
