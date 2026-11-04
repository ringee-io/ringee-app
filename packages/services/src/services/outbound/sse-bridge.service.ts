import { randomUUID } from "node:crypto";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { RealtimeBusService } from "@ringee/platform";
import { Subject, Observable, filter, map } from "rxjs";

export interface SSEEvent {
  channel: string;
  event: string;
  data: any;
}

export interface SSEMessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

/** Redis channel carrying every SSE event between API instances. */
const SSE_RELAY_CHANNEL = "ringee:realtime:sse-bridge:v1";

/** What travels over Redis: the event plus who sent it and how. */
interface RelayedSSEEvent extends SSEEvent {
  origin: string;
  /** The sender already handed the event to its own streams. */
  deliveredHere: boolean;
}

function isRelayedSSEEvent(value: unknown): value is RelayedSSEEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RelayedSSEEvent>;
  return (
    typeof candidate.origin === "string" &&
    typeof candidate.channel === "string" &&
    typeof candidate.event === "string" &&
    typeof candidate.deliveredHere === "boolean"
  );
}

/**
 * Event bridge for SSE streams, across every API instance.
 *
 * Emitters (the dialer loop, call webhooks, the Ringee AI chat) and the SSE
 * endpoint that holds an agent's stream are often in different processes: two
 * API tasks, or the old and new task during a rolling deploy. Every event is
 * therefore published to Redis and every instance relays what arrives to the
 * streams it holds.
 *
 * Each process hands an event to its own streams exactly once. While the relay
 * is listening, that happens through the relay — including for events this
 * instance sent itself. Before it listens (or after it failed) the sender
 * delivers locally and flags the message, so the relay skips its echo. If Redis
 * refuses a message, the sender still reaches its own streams, as a single
 * instance always did.
 */
@Injectable()
export class SSEBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(SSEBridgeService.name);
  private readonly subject = new Subject<SSEEvent>();
  private readonly origin = randomUUID();
  private relay: Promise<void> | null = null;
  private relayActive = false;
  private stopRelay: (() => void) | null = null;
  private destroyed = false;

  constructor(private readonly bus: RealtimeBusService) {}

  /**
   * Start relaying events from every instance to this one's streams.
   * Idempotent; a failed attempt is retried on the next call.
   */
  listen(): Promise<void> {
    if (!this.relay) {
      this.relay = this.bus
        .subscribe(SSE_RELAY_CHANNEL, (payload) => this.deliver(payload))
        .then((unsubscribe) => {
          if (this.destroyed) {
            unsubscribe();
            return;
          }
          this.stopRelay = unsubscribe;
          this.relayActive = true;
        })
        .catch((error: unknown) => {
          this.relay = null;
          this.logger.error(
            `SSE relay unavailable, delivering to local streams only: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
    return this.relay;
  }

  onModuleDestroy() {
    this.destroyed = true;
    this.relayActive = false;
    this.stopRelay?.();
    this.stopRelay = null;
    this.subject.complete();
  }

  /**
   * Emit an event to a specific channel (e.g. "agent:<sessionId>").
   */
  emit(channel: string, event: string, data: any): void {
    const deliveredHere = !this.relayActive;
    if (deliveredHere) this.subject.next({ channel, event, data });

    const message: RelayedSSEEvent = {
      channel,
      event,
      data,
      origin: this.origin,
      deliveredHere,
    };
    void this.bus.tryPublish(SSE_RELAY_CHANNEL, message).then((published) => {
      // Redis never took it, so no echo is coming: reach our own streams.
      if (!published && !deliveredHere) {
        this.subject.next({ channel, event, data });
      }
    });
  }

  /**
   * Subscribe to events on a specific channel.
   * Returns an Observable compatible with NestJS @Sse().
   */
  subscribe(channel: string): Observable<SSEMessageEvent> {
    void this.listen();
    return this.subject.asObservable().pipe(
      filter((e) => e.channel === channel),
      map(
        (e) =>
          ({
            data: JSON.stringify({ ...e.data, _event: e.event }),
            type: e.event,
          }) as SSEMessageEvent,
      ),
    );
  }

  private deliver(payload: unknown): void {
    if (!isRelayedSSEEvent(payload)) return;
    if (payload.origin === this.origin && payload.deliveredHere) return;
    this.subject.next({
      channel: payload.channel,
      event: payload.event,
      data: payload.data,
    });
  }
}
