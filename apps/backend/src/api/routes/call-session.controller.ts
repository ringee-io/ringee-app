import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
  Public,
} from "@ringee/platform";
import {
  CallSessionService,
  CreateCallSessionInput,
} from "@ringee/services";
import {
  CallOutcome,
  CallSessionActorSource,
  CallSessionSource,
  CallSessionStatus,
} from "@ringee/database";
import { apiConfiguration } from "@ringee/configuration";

const VALID_OUTCOMES = new Set<string>([
  CallOutcome.meeting_booked,
  CallOutcome.sale,
  CallOutcome.interested,
  CallOutcome.follow_up,
  CallOutcome.callback_scheduled,
  CallOutcome.not_interested,
  CallOutcome.no_answer,
  CallOutcome.voicemail,
  CallOutcome.wrong_number,
  CallOutcome.gatekeeper,
]);

interface ContactRow {
  contactId?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  company?: string | null;
}

interface CreateBody {
  title?: string;
  campaignId?: string | null;
  contacts: ContactRow[];
  expiresInMinutes?: number;
  maxCalls?: number;
  metadata?: Record<string, unknown> | null;
}

interface UpdateBody {
  title?: string | null;
  campaignId?: string | null;
  expiresInMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
  status?: CallSessionStatus;
  contacts?: ContactRow[] | null;
}

interface TokenBody {
  token: string;
}

interface SaveOutcomeBody extends TokenBody {
  outcome: string;
  outcomeNote?: string | null;
  callbackAt?: string | null;
  meeting?: {
    scheduledAt: string;
    title?: string;
    duration?: number;
    location?: string;
    notes?: string;
    attendeeEmail?: string;
  } | null;
}

interface SkipBody extends TokenBody {
  reason?: string | null;
}

interface StopRecordingBody extends TokenBody {
  recordingId: string;
}

interface SafeSessionResponse {
  callSessionId: string;
  joinUrl: string;
  expiresAt: string | null;
  contactsCount: number;
  status: CallSessionStatus;
}

@Controller("call-sessions")
export class CallSessionController {
  constructor(private readonly service: CallSessionService) {}

  // ── Owner-authenticated endpoints (Clerk) ──────────────────

  @Post()
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateBody,
  ): Promise<SafeSessionResponse> {
    if (!body?.contacts || body.contacts.length === 0) {
      throw new BadRequestException("contacts is required");
    }
    const input: CreateCallSessionInput = {
      userId: user.id,
      organizationId: user.activeOrgId ?? null,
      campaignId: body.campaignId ?? null,
      title: body.title ?? null,
      contacts: body.contacts,
      expiresInMinutes: body.expiresInMinutes ?? null,
      maxCalls: body.maxCalls ?? null,
      metadata: body.metadata ?? null,
      source: CallSessionSource.dashboard,
      actorUserId: user.id,
    };
    const { session, items, rawToken } =
      await this.service.createSession(input);
    return {
      callSessionId: session.id,
      joinUrl: buildJoinUrl(rawToken),
      expiresAt: session.expiresAt?.toISOString() ?? null,
      contactsCount: items.length,
      status: session.status,
    };
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserData,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.service.listForOwner(ctx, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: (status as CallSessionStatus) ?? undefined,
    });
  }

  @Get(":id")
  async detail(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    const { session, items, hasActiveToken } =
      await this.service.getOwnedSessionWithItems(ctx, id);
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      campaignId: session.campaignId,
      expiresAt: session.expiresAt,
      callsCompleted: session.callsCompleted,
      maxCalls: session.maxCalls,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      joinUrlAvailable: hasActiveToken,
      items: items.map((i) => ({
        id: i.id,
        contactId: i.contactId,
        phoneNumber: i.phoneNumber,
        displayName: i.displayName,
        company: i.company,
        status: i.status,
        positionIndex: i.positionIndex,
        outcome: i.outcome,
      })),
    };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: UpdateBody,
  ): Promise<SafeSessionResponse> {
    const ctx = createOwnershipContext(user);
    const updated = await this.service.updateSession(ctx, id, {
      title: body.title ?? undefined,
      campaignId: body.campaignId === undefined ? undefined : body.campaignId,
      expiresInMinutes: body.expiresInMinutes ?? null,
      metadata: body.metadata ?? null,
      status: body.status ?? null,
      contacts: body.contacts ?? null,
      actorSource: CallSessionActorSource.dashboard,
      actorUserId: user.id,
    });
    const items = await this.service.getOwnedSessionWithItems(ctx, updated.id);
    return {
      callSessionId: updated.id,
      joinUrl: "",
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      contactsCount: items.items.length,
      status: updated.status,
    };
  }

  @Delete(":id")
  async revoke(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    const session = await this.service.revokeSession(ctx, id, {
      source: CallSessionActorSource.dashboard,
      userId: user.id,
    });
    return {
      success: true,
      callSessionId: session.id,
      status: session.status,
    };
  }

  // ── Public, token-authenticated endpoints ──────────────────

  @Public()
  @Get("join/validate")
  async validateJoin(
    @Query("token") token: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    if (!token) {
      throw new BadRequestException("token is required");
    }
    const {
      session,
      items,
      creditsOk,
      creditBalance,
      callerIdNumber,
      telephony,
    } = await this.service.openWithToken(token, {
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
    });

    const total = items.length;
    const completed = items.filter(
      (i) =>
        i.status === "completed" ||
        i.status === "skipped" ||
        i.status === "failed",
    ).length;

    return {
      valid: true,
      creditsOk,
      creditBalance,
      callerIdNumber,
      telephony,
      session: {
        id: session.id,
        title: session.title,
        expiresAt: session.expiresAt,
        status: session.status,
        progress: {
          total,
          completed,
          remaining: total - completed,
        },
        items: items.map((i) => ({
          id: i.id,
          displayName: i.displayName ?? "Unknown contact",
          company: i.company,
          phoneNumberMasked: maskPhone(i.phoneNumber),
          phoneNumber: i.phoneNumber, // needed for WebRTC dial
          status: i.status,
          outcome: i.outcome,
          positionIndex: i.positionIndex,
        })),
      },
    };
  }

  @Public()
  @Get("join/credit")
  async credit(@Query("token") token: string) {
    if (!token) {
      throw new BadRequestException("token is required");
    }
    return this.service.getCreditForToken(token);
  }

  @Public()
  @Post(":id/items/:itemId/start-call")
  async startCall(
    @Param("id") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: TokenBody,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    if (!body?.token) {
      throw new BadRequestException("token is required");
    }
    return this.service.startCallForItem(body.token, sessionId, itemId, {
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Public()
  @Post(":id/items/:itemId/end-call")
  async endCall(
    @Param("id") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: TokenBody,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    if (!body?.token) {
      throw new BadRequestException("token is required");
    }
    return this.service.endCallForItem(body.token, sessionId, itemId, {
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Public()
  @Post(":id/items/:itemId/outcome")
  async saveOutcome(
    @Param("id") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: SaveOutcomeBody,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    if (!body?.token) {
      throw new BadRequestException("token is required");
    }
    if (!body.outcome || !VALID_OUTCOMES.has(body.outcome)) {
      throw new BadRequestException("Invalid outcome");
    }
    return this.service.saveOutcomeForItem(
      body.token,
      sessionId,
      itemId,
      {
        outcome: body.outcome as CallOutcome,
        outcomeNote: body.outcomeNote ?? null,
        callbackAt: body.callbackAt ?? null,
        meeting: body.meeting ?? null,
      },
      { ipAddress: ip ?? null, userAgent: userAgent ?? null },
    );
  }

  @Public()
  @Post(":id/items/:itemId/skip")
  async skipItem(
    @Param("id") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: SkipBody,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    if (!body?.token) {
      throw new BadRequestException("token is required");
    }
    return this.service.skipItem(
      body.token,
      sessionId,
      itemId,
      body.reason ?? null,
      { ipAddress: ip ?? null, userAgent: userAgent ?? null },
    );
  }

  @Public()
  @Post(":id/items/:itemId/recording/start")
  async startRecording(
    @Param("id") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: TokenBody,
  ) {
    if (!body?.token) {
      throw new BadRequestException("token is required");
    }
    return this.service.startRecordingForItem(body.token, sessionId, itemId);
  }

  @Public()
  @Post(":id/items/:itemId/recording/stop")
  async stopRecording(
    @Param("id") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: StopRecordingBody,
  ) {
    if (!body?.token || !body.recordingId) {
      throw new BadRequestException("token and recordingId are required");
    }
    return this.service.stopRecordingForItem(
      body.token,
      sessionId,
      itemId,
      body.recordingId,
    );
  }
}

function buildJoinUrl(rawToken: string): string {
  const base = apiConfiguration.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/dialer/session?token=${encodeURIComponent(rawToken)}`;
}

function maskPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length <= 6) return digits;
  const country = digits.startsWith("+") ? digits.slice(0, 3) : "";
  const tail = digits.slice(-4);
  const middle = "*".repeat(Math.max(3, digits.length - country.length - 4));
  return `${country} ${middle} ${tail}`.trim();
}
