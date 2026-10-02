import { Injectable, Logger } from "@nestjs/common";
import {
  CliAuthRequestRepository,
  McpUsageAuthMethod,
  McpUsageAuthRow,
  McpUsageClientRow,
  McpUsageDailyRow,
  McpUsageRepository,
  McpUsageSurface,
  McpUsageToolRow,
  McpUsageUserRow,
  PersonalApiKeyRepository,
  PersonalApiKeySource,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import type { McpClientInfo } from "./personal-api-key.service";

/** `clientInfo.name` the `ringee` CLI sends from 0.3.0 on. */
export const RINGEE_CLI_CLIENT_NAME = "ringee-cli";
/**
 * The name the shared agent client sent before the CLI identified itself. Over
 * a legacy connector URL it can only be the CLI; over OAuth it is the ChatGPT
 * app proxy, which is an MCP client in its own right.
 */
const LEGACY_AGENT_CLIENT_NAME = "ringee-agent";

/**
 * How long usage events are kept. A year answers "how is adoption trending"
 * while keeping the table — and the backoffice aggregates over it — bounded.
 */
export const MCP_USAGE_RETENTION_DAYS = 365;
const PRUNE_BATCH_SIZE = 5_000;
/** Caps one pass; whatever is left goes on the next daily run. */
const PRUNE_MAX_BATCHES = 40;

/** How a live MCP connection authenticated, for attributing its usage. */
export interface McpConnectionMeta {
  authMethod: McpUsageAuthMethod;
  apiKeyId?: string | null;
  apiKeySource?: PersonalApiKeySource | null;
}

export interface McpUsageStats {
  range: { start: Date; end: Date };
  totals: {
    users: number;
    cliUsers: number;
    mcpUsers: number;
    toolCalls: number;
    toolErrors: number;
    connects: number;
    activeApiKeys: number;
    apiKeysCreated: { dashboard: number; cli: number };
    cliLogins: {
      started: number;
      completed: number;
      denied: number;
      abandoned: number;
    };
  };
  surfaces: {
    surface: McpUsageSurface;
    users: number;
    connects: number;
    toolCalls: number;
    errors: number;
  }[];
  clients: McpUsageClientRow[];
  authMethods: McpUsageAuthRow[];
  tools: McpUsageToolRow[];
  daily: McpUsageDailyRow[];
  users: McpUsageUserRow[];
}

/**
 * Measures who uses the agent surfaces — the MCP endpoint (any client: Claude,
 * Cursor, ChatGPT…) and the `ringee` CLI (which speaks MCP underneath).
 *
 * Recording is fire-and-forget: telemetry must never fail or slow a tool call.
 */
@Injectable()
export class McpUsageService {
  private readonly logger = new Logger(McpUsageService.name);

  constructor(
    private readonly repo: McpUsageRepository,
    private readonly apiKeys: PersonalApiKeyRepository,
    private readonly cliAuth: CliAuthRequestRepository,
  ) {}

  static surfaceOf(
    client: McpClientInfo | null | undefined,
    meta: McpConnectionMeta,
  ): McpUsageSurface {
    const name = client?.name?.toLowerCase() ?? null;
    if (name === RINGEE_CLI_CLIENT_NAME) return "cli";
    if (name === LEGACY_AGENT_CLIENT_NAME && meta.authMethod === "url") {
      return "cli";
    }
    if (!name && meta.apiKeySource === "cli") return "cli";
    return "mcp";
  }

  recordConnect(
    ctx: OwnershipContext,
    meta: McpConnectionMeta,
    client: McpClientInfo | null,
  ): void {
    this.record({
      type: "connect",
      ctx,
      meta,
      client,
    });
  }

  recordToolCall(
    ctx: OwnershipContext,
    meta: McpConnectionMeta,
    client: McpClientInfo | null,
    call: { toolName: string; success: boolean; durationMs: number },
  ): void {
    this.record({ type: "tool_call", ctx, meta, client, call });
  }

  /**
   * Retention: delete events older than MCP_USAGE_RETENTION_DAYS, in bounded
   * batches. Run daily by the orchestrator; safe to run twice.
   */
  async pruneExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - MCP_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    let deleted = 0;
    for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch++) {
      const count = await this.repo.deleteOlderThan(cutoff, PRUNE_BATCH_SIZE);
      deleted += count;
      if (count < PRUNE_BATCH_SIZE) break;
    }
    return deleted;
  }

  async getStats(start: Date, end: Date): Promise<McpUsageStats> {
    const [
      users,
      surfaces,
      clients,
      authMethods,
      tools,
      daily,
      topUsers,
      activeApiKeys,
      keysCreated,
      logins,
    ] = await Promise.all([
      this.repo.distinctUsers(start, end),
      this.repo.bySurface(start, end),
      this.repo.byClient(start, end),
      this.repo.byAuthMethod(start, end),
      this.repo.topTools(start, end),
      this.repo.daily(start, end),
      this.repo.topUsers(start, end),
      this.apiKeys.countActive(),
      this.apiKeys.countCreatedBySource(start, end),
      this.cliAuth.countByStatus(start, end),
    ]);

    const surface = (s: McpUsageSurface) =>
      surfaces.find((r) => r.surface === s);
    const sum = (pick: (r: (typeof surfaces)[number]) => number) =>
      surfaces.reduce((acc, r) => acc + pick(r), 0);

    return {
      range: { start, end },
      totals: {
        users,
        cliUsers: surface("cli")?.users ?? 0,
        mcpUsers: surface("mcp")?.users ?? 0,
        toolCalls: sum((r) => r.toolCalls),
        toolErrors: sum((r) => r.errors),
        connects: sum((r) => r.connects),
        activeApiKeys,
        apiKeysCreated: keysCreated,
        cliLogins: {
          started:
            logins.pending + logins.approved + logins.denied + logins.consumed,
          completed: logins.consumed,
          denied: logins.denied,
          abandoned: logins.pending,
        },
      },
      surfaces,
      clients,
      authMethods,
      tools,
      daily,
      users: topUsers,
    };
  }

  private record(input: {
    type: "connect" | "tool_call";
    ctx: OwnershipContext;
    meta: McpConnectionMeta;
    client: McpClientInfo | null;
    call?: { toolName: string; success: boolean; durationMs: number };
  }): void {
    const { ctx, meta, client, call } = input;
    void this.repo
      .record({
        type: input.type,
        surface: McpUsageService.surfaceOf(client, meta),
        authMethod: meta.authMethod,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        apiKeyId: meta.apiKeyId ?? null,
        clientName: client?.name?.slice(0, 100) ?? null,
        clientVersion: client?.version?.slice(0, 50) ?? null,
        toolName: call?.toolName ?? null,
        success: call?.success ?? true,
        durationMs: call ? Math.round(call.durationMs) : null,
      })
      .catch((err: Error) => {
        this.logger.warn(`Could not record MCP usage: ${err.message}`);
      });
  }
}
