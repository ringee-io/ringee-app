import { createClient } from "@keyv/redis";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { RedisService } from "../../redis/redis.service";

export const PROVIDER_DISPATCH_REDIS = Symbol("PROVIDER_DISPATCH_REDIS");

/** Coordination follows the billing account across environments, rather than
 * each application's cache. Do not block inbound startup on its availability. */
@Injectable()
export class DispatchRedisConnection implements OnModuleDestroy {
  private readonly logger = new Logger(DispatchRedisConnection.name);
  private readonly client: ReturnType<typeof createClient> | null;
  readonly redis: RedisService | null;

  constructor() {
    const url = apiConfiguration.PROVIDER_DISPATCH_REDIS_URL;
    this.client = url
      ? createClient({
          url,
          disableOfflineQueue: true,
          socket: { connectTimeout: 1_000 },
        })
      : null;
    this.redis = this.client ? new RedisService(this.client as never) : null;
    if (this.client) {
      this.client.on("error", () =>
        this.logger.error(
          "Provider dispatch coordination is unavailable; new outbound legs are deferred.",
        ),
      );
      void this.client
        .connect()
        .catch(() =>
          this.logger.error(
            "Provider dispatch coordination could not connect.",
          ),
        );
    } else {
      this.logger.error(
        "PROVIDER_DISPATCH_REDIS_URL is unset; outbound enforcement will defer calls.",
      );
    }
  }

  onModuleDestroy(): void {
    if (this.client?.isOpen) this.client.destroy();
  }
}
