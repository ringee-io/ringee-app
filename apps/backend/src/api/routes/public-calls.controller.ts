import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { CallOutcome, CallStatus } from "@ringee/database";
import type { Call } from "@ringee/database";
import { Public } from "@ringee/platform";
import {
  CallService,
  CustomIntegrationOutboundService,
  RecordingService,
} from "@ringee/services";
import type { Response } from "express";
import { parseIsoDateBound } from "../query-dates";
import {
  CustomIntegrationApiKeyGuard,
  type CustomIntegrationApiRequest,
} from "../guards/custom-integration-api-key.guard";
import { PublicApiRateLimitGuard } from "../guards/public-api-rate-limit.guard";
import { parsePositiveInteger } from "./public-api.query";

/**
 * The server-to-server call history API (HOOK-010).
 *
 * A call is read through the integration's workspace, so an id from anywhere
 * else is a 404 — the same answer as an id that never existed. The detail is
 * the object `call.completed` and `call.outcome.updated` carry as `data.call`:
 * outcome, transcript, recording and the AI voice agent's analysis, without
 * cost, provider ids or the encrypted archive URL.
 */
@Public()
@UseGuards(CustomIntegrationApiKeyGuard, PublicApiRateLimitGuard)
@Controller("v1/calls")
export class PublicCallsController {
  constructor(
    private readonly calls: CallService,
    private readonly events: CustomIntegrationOutboundService,
    private readonly recordings: RecordingService,
  ) {}

  @Get()
  async list(
    @Req() request: CustomIntegrationApiRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("contact_id") contactId?: string,
    @Query("outcome") outcome?: string,
    @Query("status") status?: string,
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    const pageSize = parsePositiveInteger(limit, "limit", 100) ?? 20;
    const result = await this.calls.listByOwnerPaginated(
      request.customIntegrationAuth.ctx,
      {
        page: parsePositiveInteger(page, "page"),
        limit: pageSize,
        contactId: parseUuid(contactId, "contact_id"),
        outcome: parseEnum(outcome, CallOutcome, "outcome"),
        status: parseEnum(status, CallStatus, "status"),
        dateFrom: parseIsoDateBound(dateFrom, "date_from")?.toISOString(),
        dateTo: parseIsoDateBound(dateTo, "date_to")?.toISOString(),
        includeTranscriptions: false,
      },
    );
    return {
      data: result.data.map(toPublicCallSummary),
      total: result.total,
      page: result.page,
      limit: pageSize,
      totalPages: result.totalPages,
    };
  }

  @Get(":callId")
  async get(
    @Req() request: CustomIntegrationApiRequest,
    @Param("callId", ParseUUIDPipe) callId: string,
  ) {
    const call = await this.events.getCallDetail(
      request.customIntegrationAuth.ctx,
      callId,
    );
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }

  /**
   * The recording as mp3, decrypted on the server with the workspace key
   * (REC-001): the stored copy is ciphertext, which no client of this API could
   * play. A call that is not the workspace's, and one with no finished
   * recording, answer the same 404.
   */
  @Get(":callId/recording")
  @Header("Cache-Control", "private, no-store")
  async recording(
    @Req() request: CustomIntegrationApiRequest,
    @Param("callId", ParseUUIDPipe) callId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = request.customIntegrationAuth.ctx;
    const resolved = await this.events.resolveCallId(ctx, callId);
    const audio = resolved
      ? await this.recordings.getPlaybackAudio(ctx, resolved)
      : null;
    if (!audio) throw new NotFoundException("Recording not found");
    response.setHeader("Content-Type", "audio/mpeg");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="recording-${callId}.mp3"`,
    );
    return new StreamableFile(audio);
  }
}

/** One call in a list: the facts, not the transcript or the analysis. */
export function toPublicCallSummary(call: Call) {
  return {
    id: call.id,
    direction: call.direction,
    status: call.status,
    source: call.source,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    contactId: call.contactId,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    createdAt: call.createdAt,
    durationSeconds: call.durationSeconds,
    outcome: call.outcome,
    outcomeNote: call.outcomeNote,
    dispositionName: call.dispositionName,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(raw: string | undefined, field: string): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!UUID_PATTERN.test(raw)) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
  return raw;
}

/** One enum value, as the repository takes it (an array of one). */
function parseEnum<T extends string>(
  raw: string | undefined,
  values: Record<string, T>,
  field: string,
): T[] | undefined {
  if (raw === undefined || raw === "") return undefined;
  const allowed = Object.values(values);
  if (!allowed.includes(raw as T)) {
    throw new BadRequestException(
      `${field} must be one of: ${allowed.join(", ")}`,
    );
  }
  return [raw as T];
}
