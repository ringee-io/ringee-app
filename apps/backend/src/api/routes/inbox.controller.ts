import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import {
  InboxTimelineService,
  MessageService,
  CallService,
} from "@ringee/services";
import {
  InboxThreadStatus,
  InboxEventKind,
} from "@ringee/database";

@Controller("inbox")
export class InboxController {
  constructor(
    private readonly timeline: InboxTimelineService,
    private readonly messageService: MessageService,
    private readonly callService: CallService,
  ) {}

  /**
   * Materialise inbox threads + events from existing Calls. Useful when
   * the Inbox feature ships and there is already call history to surface.
   * Idempotent: re-running won't duplicate events.
   */
  @Post("backfill/calls")
  async backfillFromCalls(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { limit?: number } = {},
  ) {
    const ctx = createOwnershipContext(user);
    const { data: calls } = await this.callService.listByOwnerPaginated(ctx, {
      page: 1,
      limit: Math.min(body?.limit ?? 200, 500),
      orderBy: "createdAt",
      sortDirection: "asc",
    });
    return this.timeline.backfillFromCalls(ctx, calls);
  }

  @Get("threads")
  async listThreads(
    @CurrentUser() user: CurrentUserData,
    @Query()
    query: {
      status?: string | string[];
      unreadOnly?: string;
      kind?: string | string[];
      search?: string;
      page?: string;
      limit?: string;
    } = {},
  ) {
    const ctx = createOwnershipContext(user);

    const status = query.status
      ? Array.isArray(query.status)
        ? (query.status as InboxThreadStatus[])
        : [query.status as InboxThreadStatus]
      : undefined;

    const kindIn = query.kind
      ? Array.isArray(query.kind)
        ? (query.kind as InboxEventKind[])
        : [query.kind as InboxEventKind]
      : undefined;

    return this.timeline.listThreads(ctx, {
      status,
      kindIn,
      unreadOnly: query.unreadOnly === "true",
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Get("threads/:id")
  async getThread(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.timeline.ensureAccess(ctx, id);
  }

  @Get("threads/:id/events")
  async listEvents(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Query()
    query: { kind?: string | string[]; page?: string; limit?: string } = {},
  ) {
    const ctx = createOwnershipContext(user);
    await this.timeline.ensureAccess(ctx, id);

    const kindIn = query.kind
      ? Array.isArray(query.kind)
        ? (query.kind as InboxEventKind[])
        : [query.kind as InboxEventKind]
      : undefined;

    return this.timeline.listEvents(id, {
      kindIn,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Post("threads/:id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    await this.timeline.markRead(ctx, id);
  }

  @Post("threads/:id/resolve")
  async resolve(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.timeline.resolveThread(ctx, id);
  }

  @Post("threads/:id/archive")
  async archive(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.timeline.archiveThread(ctx, id);
  }

  @Post("threads/:id/reopen")
  async reopen(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    const ctx = createOwnershipContext(user);
    return this.timeline.reopenThread(ctx, id);
  }

  @Post("threads/:id/assign")
  async assign(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { assigneeId: string | null },
  ) {
    const ctx = createOwnershipContext(user);
    return this.timeline.assignThread(ctx, id, body.assigneeId ?? null);
  }

  @Post("threads/:id/notes")
  async addNote(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: { note: string },
  ) {
    if (!body?.note?.trim()) {
      throw new BadRequestException("Note is required");
    }
    const ctx = createOwnershipContext(user);
    await this.timeline.ensureAccess(ctx, id);
    return this.timeline.appendInternalNote({
      ctx,
      threadId: id,
      note: body.note.trim(),
      userId: user.id,
    });
  }

  @Post("messages")
  async sendMessage(
    @CurrentUser() user: CurrentUserData,
    @Body()
    body: {
      fromNumber: string;
      toNumber: string;
      text?: string;
      mediaUrls?: string[];
      threadId?: string;
      contactId?: string;
      idempotencyKey?: string;
    },
  ) {
    const fromNumber = normalizePhone(body?.fromNumber);
    const toNumber = normalizePhone(body?.toNumber);

    if (!fromNumber || !toNumber) {
      throw new BadRequestException("fromNumber and toNumber are required");
    }
    if (!E164_REGEX.test(fromNumber) || !E164_REGEX.test(toNumber)) {
      throw new BadRequestException(
        "fromNumber and toNumber must be in E.164 format (e.g. +14155550100)",
      );
    }
    if (fromNumber === toNumber) {
      throw new BadRequestException("fromNumber and toNumber must differ");
    }

    const text = typeof body.text === "string" ? body.text.trim() : undefined;
    const mediaUrls = Array.isArray(body.mediaUrls)
      ? body.mediaUrls.map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean)
      : [];

    if (!text && mediaUrls.length === 0) {
      throw new BadRequestException("Message must have text or at least one media URL");
    }
    if (text && text.length > MAX_SMS_TEXT_LENGTH) {
      throw new BadRequestException(
        `Message text exceeds ${MAX_SMS_TEXT_LENGTH} characters`,
      );
    }
    if (mediaUrls.length > MAX_MEDIA_URLS) {
      throw new BadRequestException(
        `Up to ${MAX_MEDIA_URLS} media URLs are allowed per message`,
      );
    }
    for (const url of mediaUrls) {
      if (!/^https?:\/\//i.test(url)) {
        throw new BadRequestException(`Invalid media URL: ${url}`);
      }
    }
    if (body.idempotencyKey && body.idempotencyKey.length > 128) {
      throw new BadRequestException("idempotencyKey is too long (max 128 chars)");
    }

    const ctx = createOwnershipContext(user);
    return this.messageService.sendSms({
      ctx,
      fromNumber,
      toNumber,
      text,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      threadId: body.threadId,
      contactId: body.contactId,
      idempotencyKey: body.idempotencyKey,
    });
  }
}

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const MAX_SMS_TEXT_LENGTH = 1600;
const MAX_MEDIA_URLS = 10;

function normalizePhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
