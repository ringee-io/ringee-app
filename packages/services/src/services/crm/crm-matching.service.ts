import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CrmCallSyncRepository,
  CrmConnection,
  CrmContactLink,
  CrmContactLinkRepository,
  CrmOutboxRepository,
} from "@ringee/database";
import {
  CrmError,
  CrmProviderRegistry,
  CrmRecordMatch,
  normalizePhoneE164,
  RedisService,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

const MATCH_CACHE_TTL_MS = 60 * 1000;

export type ResolvedMatch = {
  link: CrmContactLink | null;
  candidates: CrmRecordMatch[];
  phoneE164: string | null;
};

@Injectable()
export class CrmMatchingService {
  private readonly logger = new Logger(CrmMatchingService.name);

  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly linkRepo: CrmContactLinkRepository,
    private readonly connections: CrmConnectionService,
    private readonly redis: RedisService,
    private readonly syncRepo: CrmCallSyncRepository,
    private readonly outbox: CrmOutboxRepository,
  ) {}

  async resolveByPhone(
    connection: CrmConnection,
    phoneRaw: string,
  ): Promise<ResolvedMatch> {
    const phoneE164 = normalizePhoneE164(phoneRaw);
    if (!phoneE164) return { link: null, candidates: [], phoneE164: null };

    const cached = await this.linkRepo.findByPhone(connection.id, phoneE164);
    if (cached) {
      return { link: cached, candidates: [], phoneE164 };
    }

    const cacheKey = `crm-match-${connection.id}-${phoneE164}`;
    const cachedCandidates = await this.redis.get<CrmRecordMatch[]>(cacheKey);
    if (cachedCandidates) {
      return this.fromCandidates(connection, phoneE164, cachedCandidates);
    }

    const provider = this.registry.get(connection.provider);
    const decrypted = await this.connections.getValidCredentials(connection);

    let candidates: CrmRecordMatch[];
    try {
      candidates = await provider.searchByPhone(
        {
          accessToken: decrypted.accessToken,
          refreshToken: decrypted.refreshToken,
          accountId: connection.externalAccountId,
          connectionId: connection.id,
        },
        phoneE164,
        { limit: 10 },
      );
    } catch (err) {
      if (err instanceof CrmError && err.code === "AUTH_EXPIRED") {
        throw err;
      }
      this.logger.warn(
        `match lookup failed for ${connection.provider} phone=${phoneE164}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { link: null, candidates: [], phoneE164 };
    }

    await this.redis.set(cacheKey, candidates, MATCH_CACHE_TTL_MS);
    return this.fromCandidates(connection, phoneE164, candidates);
  }

  private async fromCandidates(
    connection: CrmConnection,
    phoneE164: string,
    candidates: CrmRecordMatch[],
  ): Promise<ResolvedMatch> {
    const exact = candidates.filter((c) => c.matchedOn === "phone_exact");

    if (exact.length === 1) {
      const picked = exact[0];
      const link = await this.linkRepo.upsertLink({
        connectionId: connection.id,
        provider: connection.provider,
        externalId: picked.externalId,
        externalType: picked.externalType,
        phoneNumberE164: phoneE164,
        matchConfidence: "phone_exact",
        rawSnapshot: (picked.raw ?? null) as never,
      });
      return { link, candidates, phoneE164 };
    }

    return { link: null, candidates, phoneE164 };
  }

  async invalidate(connectionId: string, phoneE164: string): Promise<void> {
    await this.redis.del(`crm-match-${connectionId}-${phoneE164}`);
  }

  async resolveAmbiguousMatch(
    syncId: string,
    chosenExternalId: string,
    chosenExternalType: "person" | "company",
  ): Promise<void> {
    const sync = await this.syncRepo.findById(syncId);
    if (!sync) throw new NotFoundException("sync not found");
    if (sync.status !== "needs_resolution") {
      throw new Error("sync is not in needs_resolution status");
    }

    const payload = sync.payloadSnapshot as Record<string, unknown>;
    const phoneE164 = (payload.to as string) ?? (payload.from as string);

    await this.linkRepo.upsertLink({
      connectionId: sync.connectionId,
      provider: sync.provider,
      externalId: chosenExternalId,
      externalType: chosenExternalType,
      phoneNumberE164: normalizePhoneE164(phoneE164) ?? phoneE164,
      matchConfidence: "user_resolved",
    });

    (payload as Record<string, unknown>).linkedRecords = [
      { externalId: chosenExternalId, externalType: chosenExternalType },
    ];
    (payload as Record<string, unknown>).needsPersonCreation = null;

    await this.syncRepo.markStatus(sync.id, "pending", null);

    await this.outbox.enqueue({
      connectionId: sync.connectionId,
      provider: sync.provider,
      kind: "call.log",
      subjectId: sync.id,
      payload: { syncId: sync.id } as Record<string, unknown>,
      dedupeKey: `call.log:${sync.connectionId}:${sync.callId}:resolved`,
      nextAttemptAt: new Date(),
    });
  }
}
