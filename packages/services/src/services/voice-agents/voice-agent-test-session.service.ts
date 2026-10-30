import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
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

interface TestSessionLease {
  assertHeld(): Promise<void>;
  clearSession(): Promise<void>;
}

/** How long one open/close may hold an agent's test-session lock. */
const LOCK_TTL_SECONDS = 30;
/** How long a start or stop waits for another one on the same agent. */
const LOCK_WAIT_MS = 10_000;

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

    return this.withAgentLock(agent.id, (lease) =>
      this.open(
        agent.id,
        agent.providerAssistantId!,
        expiresAt,
        {
          ...defaults,
          ...this.clean(variables),
        },
        lease,
      ).then(() => {
        this.logger.log(
          `🎧 Test session opened for agent ${agent.id} until ${expiresAt}`,
        );
        return {
          assistantId: agent.providerAssistantId!,
          expiresAt,
          variables: this.blueprints.require(agent.type).variables,
        };
      }),
    );
  }

  /**
   * Opens the agent to anonymous web calls, recording the session first.
   * Runs under the agent's lock, so a stop cannot interleave with it.
   */
  private async open(
    agentId: string,
    assistantId: string,
    expiresAt: string,
    dynamicVariables: Record<string, string>,
    lease: TestSessionLease,
  ): Promise<void> {
    // The record goes in before the agent is opened, never after. The sweep
    // closes what this hash says is open, so an agent opened to anonymous web
    // calls with no entry yet written is an agent nothing will ever close —
    // and the failure that leaves it that way (Redis unreachable) is exactly
    // the one that also stops the sweep from noticing. Enabling second means
    // the worst case is a recorded session that was never opened, which the
    // sweep closes harmlessly.
    await this.redis.hashSet<OpenTestSession>(OPEN_SESSIONS_KEY, agentId, {
      agentId,
      assistantId,
      expiresAt,
    });
    try {
      await lease.assertHeld();
      await this.provider.configureTestAccess(assistantId, {
        enabled: true,
        dynamicVariables,
      });
      await lease.assertHeld();
    } catch (error) {
      // A timeout or lost lease does not prove the provider refused the write.
      // Keep (or restore after an overlapping close) a recovery record so the
      // sweep disables any late enable, instead of leaving it open forever.
      await this.redis
        .hashSet<OpenTestSession>(OPEN_SESSIONS_KEY, agentId, {
          agentId,
          assistantId,
          expiresAt: new Date().toISOString(),
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async end(ctx: OwnershipContext, agentId: string): Promise<void> {
    const agent = await this.agents.require(ctx, agentId);
    if (!agent.providerAssistantId) return;
    const defaults = await this.agents.resolveDefaultVariables(ctx, agent);
    await this.withAgentLock(agent.id, (lease) =>
      this.close(agent.id, agent.providerAssistantId!, lease, defaults),
    );
  }

  /**
   * Runs `work` holding the agent's test-session lock, across every API
   * instance. Opening and closing each take a provider call; interleaved, a
   * stop could delete the session record before a start finished opening the
   * agent, leaving it open to anonymous calls with nothing left to close it.
   */
  private async withAgentLock<T>(
    agentId: string,
    work: (lease: TestSessionLease) => Promise<T>,
    options: { waitMs?: number } = {},
  ): Promise<T> {
    const key = `voice-agent-test-session:lock:${agentId}`;
    const token = randomUUID();
    const deadline = Date.now() + (options.waitMs ?? LOCK_WAIT_MS);
    while (!(await this.redis.setIfAbsent(key, token, LOCK_TTL_SECONDS))) {
      if (Date.now() >= deadline) {
        throw new ConflictException(
          "This agent's test session is changing. Try again in a moment.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    let lost = false;
    let renewing = Promise.resolve();
    const renewal = setInterval(
      () => {
        renewing = renewing.then(async () => {
          if (lost) return;
          try {
            lost = !(await this.redis.renewLease(key, token, LOCK_TTL_SECONDS));
          } catch {
            lost = true;
          }
        });
      },
      (LOCK_TTL_SECONDS * 1000) / 3,
    );
    const assertHeld = async () => {
      await renewing;
      if (lost || (await this.redis.getRaw(key)) !== token) {
        throw new ConflictException(
          "Test session lease was lost; reconciliation required.",
        );
      }
    };
    try {
      return await work({
        assertHeld,
        clearSession: async () => {
          await assertHeld();
          if (
            !(await this.redis.hashDeleteUnderLease(
              OPEN_SESSIONS_KEY,
              agentId,
              key,
              token,
            ))
          ) {
            throw new ConflictException(
              "Test session lease was lost; reconciliation required.",
            );
          }
        },
      });
    } finally {
      clearInterval(renewal);
      await renewing;
      await this.redis.compareAndSwap(key, token, null).catch(() => false);
    }
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
        // Not waited on: an agent busy opening or closing is left to the next
        // sweep rather than closed under that operation's feet.
        await this.withAgentLock(
          session.agentId,
          async (lease) => {
            // The scan happened before the lock; a newer start may have
            // extended the session in between. Re-read under the lease.
            const current = (
              await this.redis.hashGetAll<OpenTestSession>(OPEN_SESSIONS_KEY)
            )[session.agentId];
            if (!current || new Date(current.expiresAt).getTime() > Date.now())
              return;
            await this.close(current.agentId, current.assistantId, lease);
            closed += 1;
          },
          { waitMs: 0 },
        );
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
    lease: TestSessionLease,
    defaults?: Record<string, string>,
  ): Promise<void> {
    await lease.assertHeld();
    await this.provider.configureTestAccess(assistantId, {
      enabled: false,
      ...(defaults ? { dynamicVariables: defaults } : {}),
    });
    await lease.assertHeld();
    await lease.clearSession();
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
