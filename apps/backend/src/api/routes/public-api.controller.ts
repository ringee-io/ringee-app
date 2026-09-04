import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AiVoiceAgentType } from "@ringee/database";
import { Public, StartVoiceAgentCallDto } from "@ringee/platform";
import {
  VoiceAgentCallService,
  VoiceAgentResultService,
  VoiceAgentService,
} from "@ringee/services";
import {
  CustomIntegrationApiKeyGuard,
  type CustomIntegrationApiRequest,
} from "../guards/custom-integration-api-key.guard";

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
      data: result.data.map((agent) => ({
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
      })),
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

  @Post(":agentId/calls")
  startCall(
    @Req() request: CustomIntegrationApiRequest,
    @Param("agentId", ParseUUIDPipe) agentId: string,
    @Body() dto: StartVoiceAgentCallDto,
  ) {
    return this.calls.startCall(request.customIntegrationAuth.ctx, agentId, {
      to: dto.to,
      fromNumberId: dto.from_number_id,
      variables: dto.variables,
      metadata: dto.metadata,
    });
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

function parsePositiveInteger(
  raw: string | undefined,
  field: string,
  max?: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    (max !== undefined && value > max)
  ) {
    throw new BadRequestException(
      max
        ? `${field} must be a whole number between 1 and ${max}`
        : `${field} must be a positive whole number`,
    );
  }
  return value;
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
