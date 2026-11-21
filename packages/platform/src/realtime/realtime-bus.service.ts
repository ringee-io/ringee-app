import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

/**
 * Minimal slice of the node-redis client this service needs. Declared locally
 * (like `RedisService` does) so the platform package does not take a hard type
 * dependency on a specific redis major.
 */
interface PubSubRedisClient {
  publish(channel: string, message: string): Promise<number>;
  subscribe(
    channel: string,
    listener: (message: string, channel: string) => void,
  ): Promise<void>;
  unsubscribe(channel?: string): Promise<void>;
  duplicate(): PubSubRedisClient;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

type Handler = (payload: unknown) => void;

/**
 * Redis pub/sub fan-out for realtime events.
 *
 * The WebSocket registry is per-process, so an action taken on API instance A
 * (a backoffice ban) must still reach sockets held by instance B. Every
 * publisher writes to Redis and every instance subscribes, which keeps the
 * gateway correct under horizontal scaling without any sticky routing.
 *
 * A subscriber connection cannot issue normal commands, so the shared client is
 * duplicated once, lazily, the first time something subscribes.
 */
@Injectable()
export class RealtimeBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBusService.name);
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly subscriptions = new Map<string, Promise<void>>();
  private subscriber: PubSubRedisClient | null = null;
  private subscriberReady: Promise<PubSubRedisClient> | null = null;
  private destroyed = false;

  constructor(
    @Inject("REDIS_CLIENT") private readonly client: PubSubRedisClient,
  ) {}

  onModuleInit(): void {
    this.destroyed = false;
  }

  /**
   * Publish an event to every API instance, including this one — the local
   * gateway receives it through the same subscription so there is exactly one
   * delivery path to reason about.
   */
  async publish(channel: string, payload: unknown): Promise<void> {
    await this.tryPublish(channel, payload);
  }

  /**
   * {@link publish}, reporting whether Redis took the message. A caller that
   * can still reach its own listeners another way (the SSE bridge) uses the
   * answer to fall back instead of losing the event.
   */
  async tryPublish(channel: string, payload: unknown): Promise<boolean> {
    try {
      await this.client.publish(channel, JSON.stringify(payload));
      return true;
    } catch (error) {
      // Realtime delivery is best-effort UX on top of an authoritative,
      // already-persisted action. Never fail the caller because Redis blipped.
      this.logger.error(
        `Failed to publish on ${channel}: ${this.message(error)}`,
      );
      return false;
    }
  }

  /** Register a handler for a channel. Returns an unsubscribe function. */
  async subscribe(channel: string, handler: Handler): Promise<() => void> {
    let handlers = this.handlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(channel, handlers);
      this.subscriptions.set(
        channel,
        this.ensureSubscriber().then(async (subscriber) => {
          await subscriber.subscribe(channel, (message) =>
            this.dispatch(channel, message),
          );
          this.logger.log(`Subscribed to realtime channel ${channel}`);
        }),
      );
    }
    handlers.add(handler);
    try {
      // A concurrent subscriber must wait for Redis too. Returning early can
      // activate a dialer whose event relay is not actually listening yet.
      await this.subscriptions.get(channel);
    } catch (error) {
      handlers.delete(handler);
      if (handlers.size === 0 && this.handlers.get(channel) === handlers) {
        this.handlers.delete(channel);
        this.subscriptions.delete(channel);
      }
      throw error;
    }

    return () => {
      const handlers = this.handlers.get(channel);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(channel);
        this.subscriptions.delete(channel);
        void this.subscriber?.unsubscribe(channel).catch(() => undefined);
      }
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.handlers.clear();
    this.subscriptions.clear();
    const subscriber = this.subscriber;
    this.subscriber = null;
    this.subscriberReady = null;
    if (!subscriber) return;
    await subscriber.quit().catch(() => undefined);
  }

  private ensureSubscriber(): Promise<PubSubRedisClient> {
    if (this.destroyed) {
      return Promise.reject(new Error("Realtime bus is shutting down"));
    }
    if (this.subscriberReady) {
      return this.subscriberReady;
    }

    this.subscriberReady = (async () => {
      const subscriber = this.client.duplicate();
      subscriber.on("error", (error: unknown) =>
        this.logger.error(`Realtime subscriber error: ${this.message(error)}`),
      );
      await subscriber.connect();
      this.subscriber = subscriber;
      return subscriber;
    })().catch((error) => {
      // Allow a later subscribe() to retry instead of caching the failure.
      this.subscriberReady = null;
      throw error;
    });

    return this.subscriberReady;
  }

  private dispatch(channel: string, message: string): void {
    const handlers = this.handlers.get(channel);
    if (!handlers?.size) return;

    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      this.logger.warn(`Discarded non-JSON message on ${channel}`);
      return;
    }

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        this.logger.error(
          `Realtime handler for ${channel} threw: ${this.message(error)}`,
        );
      }
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
