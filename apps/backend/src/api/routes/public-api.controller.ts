import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AiVoiceAgentType } from "@ringee/database";
import { Public, StartVoiceAgentCallDto } from "@ringee/platform";
import {
  VoiceAgentCallService,
  VoiceAgentResultService,
  VoiceAgentService,
} from "@ringee/services";
import type { Response } from "express";
import {
  CustomIntegrationApiKeyGuard,
  type CustomIntegrationApiRequest,
} from "../guards/custom-integration-api-key.guard";
import { parsePositiveInteger } from "./public-api.query";

/** A client's idempotency key: printable, no spaces, short enough to log. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:@/+=~-]{1,255}$/;

/** Shape of one agent as the public API returns it. */
interface PublicAgentSource {
  id: string;
  name: string;
  type: AiVoiceAgentType;
  status: string;
  voiceLabel: string | null;
  callCount: number;
  callerNumberId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resource-oriented public API for the execution side of AI Voice Agents.
 * Creation and configuration remain dashboard-only.
 */
@Public()
@UseGuards(CustomIntegrationApiKeyGuard)
@Controller("v1/ai-voice-agents")
export class PublicAiVoiceAgentController {
  constructor(
    private readonly agents: VoiceAgentService,
    private readonly calls: VoiceAgentCallService,
    private readonly results: VoiceAgentResultService,
  ) {}

  @Get()
  async list(
    @Req() request: CustomIntegrationApiRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("type") type?: string,
  ) {
    const ctx = request.customIntegrationAuth.ctx;
    const [result, callerNumbers] = await Promise.all([
      this.agents.list(ctx, {
        page: parsePositiveInteger(page, "page"),
        limit: parsePositiveInteger(limit, "limit", 100),
        type: parseAgentType(type),
      }),
      this.agents.listCallerNumbers(ctx),
    ]);
    const callerNumbersById = new Map(
      callerNumbers.map((number) => [number.id, number]),
    );

    return {
      ...result,
      // Public responses deliberately omit provider ids, credential references
      // and callback hashes from the underlying database row.
      data: result.data.map((agent) =>
        toPublicAgent(agent as PublicAgentSource, callerNumbersById),
      ),
      callerNumbers,
      variablesByType: Object.fromEntries(
        this.agents
          .listTypes()
          .map((agentType) => [agentType.type, agentType.variables]),
      ),
    };
  }

  @Get("phone-numbers")
  listCallerNumbers(@Req() request: CustomIntegrationApiRequest) {
    return this.agents.listCallerNumbers(request.customIntegrationAuth.ctx);
  }

  @Get("calls/:callId")
  async getCall(
    @Req() request: CustomIntegrationApiRequest,
    @Param("callId", ParseUUIDPipe) callId: string,
  ) {
    const call = await this.calls.requireCall(
      request.customIntegrationAuth.ctx,
      callId,
    );
    return this.results.toResult(call);
  }

  @Get(":agentId")
  async getAgent(
    @Req() request: CustomIntegrationApiRequest,
    @Param("agentId", ParseUUIDPipe) agentId: string,
  ) {
    const ctx = request.customIntegrationAuth.ctx;
    const [agent, callerNumbers] = await Promise.all([
      this.agents.getWithCallCount(ctx, agentId),
      this.agents.listCallerNumbers(ctx),
    ]);
    return {
      ...toPublicAgent(
        agent as PublicAgentSource,
        new Map(callerNumbers.map((number) => [number.id, number])),
      ),
      variables:
        this.agents.listTypes().find((type) => type.type === agent.type)
          ?.variables ?? [],
    };
  }

  /**
   * Starts a call. Send `Idempotency-Key` from any client that can retry: the
   * first request places the call and a repeat under the same key returns that
   * call (`200`, `Idempotent-Replayed: true`) without dialing again (HOOK-008).
   * Without the header the request behaves exactly as it always has.
   */
  @Post(":agentId/calls")
  async startCall(
    @Req() request: CustomIntegrationApiRequest,
    @Param("agentId", ParseUUIDPipe) agentId: string,
    @Body() dto: StartVoiceAgentCallDto,
    @Headers("idempotency-key")
    rawIdempotencyKey: string | string[] | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
    const { ctx, integration } = request.customIntegrationAuth;
    const started = await this.calls.startCallForClient(
      ctx,
      agentId,
      {
        to: dto.to,
        fromNumberId: dto.from_number_id,
        variables: dto.variables,
        metadata: dto.metadata,
      },
      // The scope is the authenticated integration, never a client value.
      { scope: integration.id, idempotencyKey },
    );

    if (!idempotencyKey) return { id: started.id, status: started.status };
    if (started.replayed) {
      response.status(HttpStatus.OK);
      response.setHeader("Idempotent-Replayed", "true");
    }
    return {
      id: started.id,
      status: started.status,
      idempotent_replayed: started.replayed,
    };
  }

  @Get(":agentId/calls")
  async listCalls(
    @Req() request: CustomIntegrationApiRequest,
    @Param("agentId", ParseUUIDPipe) agentId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const result = await this.calls.listCalls(
      request.customIntegrationAuth.ctx,
      agentId,
      {
        page: parsePositiveInteger(page, "page"),
        limit: parsePositiveInteger(limit, "limit", 100),
      },
    );
    return {
      ...result,
      data: result.data.map((call) => this.results.toResult(call)),
    };
  }
}

function toPublicAgent(
  agent: PublicAgentSource,
  callerNumbersById: Map<string, { phoneNumber: string }>,
) {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    voice: agent.voiceLabel,
    callCount: agent.callCount,
    callerNumberId: agent.callerNumberId,
    callsFrom: agent.callerNumberId
      ? (callerNumbersById.get(agent.callerNumberId)?.phoneNumber ?? null)
      : null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

function parseIdempotencyKey(
  raw: string | string[] | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    throw new BadRequestException(
      "Send one Idempotency-Key header, not several",
    );
  }
  const key = raw.trim();
  if (!key) return undefined;
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      "Idempotency-Key must be 1 to 255 characters: letters, digits and . _ : @ / + = ~ -",
    );
  }
  return key;
}

function parseAgentType(raw: string | undefined): AiVoiceAgentType | undefined {
  if (raw === undefined) return undefined;
  if (!Object.values(AiVoiceAgentType).includes(raw as AiVoiceAgentType)) {
    throw new BadRequestException(
      "type is not a supported AI voice agent type",
    );
  }
  return raw as AiVoiceAgentType;
}
