import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import {
  PRESENCE_TTL_MS,
  RealtimeDevice,
  presenceKey,
} from "./realtime.contracts";

/**
 * Cross-instance view of "which devices does this user currently have online".
 *
 * The authoritative socket registry is per-process, so presence is mirrored
 * into one Redis hash per user (field = connectionId). Every entry carries
 * `lastSeenAt`, refreshed on each heartbeat, and the hash itself expires — a
 * hard-killed API instance therefore cannot leave phantom devices behind.
 *
 * Presence is observability, never authorization: nothing is granted or denied
 * based on what is in here.
 */
@Injectable()
export class RealtimePresenceService {
  private readonly logger = new Logger(RealtimePresenceService.name);

  constructor(private readonly redis: RedisService) {}

  async register(userId: string, device: RealtimeDevice): Promise<void> {
    await this.safe(() =>
      this.redis.hashSet(
        presenceKey(userId),
        device.connectionId,
        device,
        Math.ceil((PRESENCE_TTL_MS * 4) / 1000),
      ),
    );
  }

  /** Refresh `lastSeenAt` for a live connection (called from the heartbeat). */
  async touch(userId: string, device: RealtimeDevice): Promise<void> {
    await this.register(userId, {
      ...device,
      lastSeenAt: new Date().toISOString(),
    });
  }

  async unregister(userId: string, connectionId: string): Promise<void> {
    await this.safe(() =>
      this.redis.hashDelete(presenceKey(userId), connectionId),
    );
  }

  /**
   * Devices seen within {@link PRESENCE_TTL_MS}, newest first. Stale members are
   * pruned lazily on read so a crashed instance self-heals without a sweeper.
   */
  async list(userId: string): Promise<RealtimeDevice[]> {
    const key = presenceKey(userId);
    const entries = await this.safe(
      () => this.redis.hashGetAll<RealtimeDevice>(key),
      {} as Record<string, RealtimeDevice>,
    );

    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const alive: RealtimeDevice[] = [];

    for (const [connectionId, device] of Object.entries(entries)) {
      const lastSeen = Date.parse(device?.lastSeenAt ?? "");
      if (!Number.isFinite(lastSeen) || lastSeen < cutoff) {
        await this.safe(() => this.redis.hashDelete(key, connectionId));
        continue;
      }
      alive.push(device);
    }

    return alive.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  private async safe<T>(op: () => Promise<T>, fallback?: T): Promise<T> {
    try {
      return await op();
    } catch (error) {
      this.logger.warn(
        `Realtime presence operation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallback as T;
    }
  }
}
