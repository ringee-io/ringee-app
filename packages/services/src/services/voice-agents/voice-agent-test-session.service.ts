import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  RedisService,
  VoiceAgentProviderService,
  type OwnershipContext,
} from "@ringee/platform";
import { VoiceAgentBlueprintRegistry } from "./blueprints/voice-agent-blueprint.registry";
import { VoiceAgentService } from "./voice-agent.service";
import type { VoiceAgentVariableDefinition } from "./voice-agent.types";

/** Redis hash of the test sessions currently holding an agent open. */
const OPEN_SESSIONS_KEY = "ringee:voice-agent-test-sessions:v1";

interface OpenTestSession {
  agentId: string;
  assistantId: string;
  /** ISO timestamp after which the sweep closes the agent again. */
  expiresAt: string;
}

export interface VoiceAgentTestSession {
  /** Handle the browser dials anonymously. */
  assistantId: string;
  expiresAt: string;
  /** The variables this agent type accepts, so the tester can fill them in. */
  variables: VoiceAgentVariableDefinition[];
}

/**
 * Browser test conversations (§14).
 *
 * Talking to an agent from a browser needs the provider to accept an
 * unauthenticated web call, which means anyone holding the assistant's id can
 * reach it and spend credits. So the agent is opened only for the length of a
 * session and closed again — explicitly when the tester is done, and by the
 * sweep if they simply close the tab.
 */
@Injectable()
export class VoiceAgentTestSessionService {
  private readonly logger = new Logger(VoiceAgentTestSessionService.name);

  constructor(
    private readonly agents: VoiceAgentService,
    private readonly blueprints: VoiceAgentBlueprintRegistry,
    private readonly provider: VoiceAgentProviderService,
    private readonly redis: RedisService,
  ) {}

  async start(
    ctx: OwnershipContext,
    agentId: string,
    variables?: Record<string, string>,
  ): Promise<VoiceAgentTestSession> {
    const agent = await this.agents.require(ctx, agentId);
    if (!agent.providerAssistantId) {
      throw new BadRequestException(
        "This agent is not finished setting up yet.",
      );
    }

    const ttlSeconds = apiConfiguration.AI_VOICE_AGENT_TEST_SESSION_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    // A browser test call carries no per-call variables, so the tester's
    // values become the assistant's defaults for the length of the session and
    // are put back when it closes.
    const defaults = await this.agents.resolveDefaultVariables(ctx, agent);

    // The record goes in before the agent is opened, never after. The sweep
    // closes what this hash says is open, so an agent opened to anonymous web
    // calls with no entry yet written is an agent nothing will ever close —
    // and the failure that leaves it that way (Redis unreachable) is exactly
    // the one that also stops the sweep from noticing. Enabling second means
    // the worst case is a recorded session that was never opened, which the
    // sweep closes harmlessly.
    await this.redis.hashSet<OpenTestSession>(OPEN_SESSIONS_KEY, agent.id, {
      agentId: agent.id,
      assistantId: agent.providerAssistantId,
      expiresAt,
    });
    try {
      await this.provider.configureTestAccess(agent.providerAssistantId, {
        enabled: true,
        dynamicVariables: { ...defaults, ...this.clean(variables) },
      });
    } catch (error) {
      await this.redis
        .hashDelete(OPEN_SESSIONS_KEY, agent.id)
        .catch(() => undefined);
      throw error;
    }

    this.logger.log(
      `🎧 Test session opened for agent ${agent.id} until ${expiresAt}`,
    );
    return {
      assistantId: agent.providerAssistantId,
      expiresAt,
      variables: this.blueprints.require(agent.type).variables,
    };
  }

  async end(ctx: OwnershipContext, agentId: string): Promise<void> {
    const agent = await this.agents.require(ctx, agentId);
    if (!agent.providerAssistantId) return;
    const defaults = await this.agents.resolveDefaultVariables(ctx, agent);
    await this.close(agent.id, agent.providerAssistantId, defaults);
  }

  /**
   * Closes every session whose window has passed. Runs on a schedule because
   * the common ending is a closed browser tab, not a click on "stop".
   */
  async sweepExpired(): Promise<number> {
    const open =
      await this.redis.hashGetAll<OpenTestSession>(OPEN_SESSIONS_KEY);
    const now = Date.now();
    let closed = 0;

    for (const session of Object.values(open)) {
      if (new Date(session.expiresAt).getTime() > now) continue;
      try {
        await this.close(session.agentId, session.assistantId);
        closed += 1;
      } catch (error) {
        // Leave the entry in place so the next sweep tries again: an agent left
        // open to anonymous calls is exactly what this must not give up on.
        this.logger.error(
          `Could not close the test session for agent ${session.agentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return closed;
  }

  /**
   * Closes the window. `defaults` restores the agent's own variable values; the
   * sweep does not have them to hand, and leaving the tester's values in place
   * is far less harmful than leaving the agent open to anonymous calls, so it
   * closes without them rather than skipping the close.
   */
  private async close(
    agentId: string,
    assistantId: string,
    defaults?: Record<string, string>,
  ): Promise<void> {
    await this.provider.configureTestAccess(assistantId, {
      enabled: false,
      ...(defaults ? { dynamicVariables: defaults } : {}),
    });
    await this.redis.hashDelete(OPEN_SESSIONS_KEY, agentId);
    this.logger.log(`🎧 Test session closed for agent ${agentId}`);
  }

  /** Only non-empty values override a default. */
  private clean(
    variables: Record<string, string> | undefined,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables ?? {})) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  }
}
