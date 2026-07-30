import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  MessageRepository,
  MessageEventRepository,
  NumberPurchasedRepository,
  ContactRepository,
  Message,
  MessageDirection,
  MessageStatus,
  MessageType,
  InboxEventDirection,
  InboxEventKind,
  InboxEventStatus,
} from "@ringee/database";
import {
  OwnershipContext,
  TelephonyService,
  TelnyxMessagingEventType,
  TelnyxMessagePayload,
  UploadFactory,
} from "@ringee/platform";
import { InboxTimelineService } from "./inbox.timeline.service";
import { CreditService } from "../credit.service";

const REUPLOAD_TIMEOUT_MS = 7000;

export interface SendSmsInput {
  ctx: OwnershipContext;
  fromNumber: string; // Ringee number (must belong to ctx)
  toNumber: string; // contact number
  text?: string;
  mediaUrls?: string[];
  threadId?: string;
  contactId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly messageEventRepo: MessageEventRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly contactRepo: ContactRepository,
    private readonly telephonyService: TelephonyService,
    private readonly inboxService: InboxTimelineService,
    private readonly creditService: CreditService,
  ) {}

  /**
   * Telnyx-hosted media URLs are temporary. Reupload to our own storage
   * (S3/R2) with a short timeout per file; on failure, fall back to the
   * original URL so the webhook still succeeds quickly.
   */
  private async reuploadMedia(urls: string[]): Promise<string[]> {
    if (!urls.length) return [];
    const storage = UploadFactory.createStorage();
    return Promise.all(
      urls.map(async (url) => {
        try {
          const reuploaded = await Promise.race([
            storage.uploadSimple(url),
            new Promise<string>((_, reject) =>
              setTimeout(
                () => reject(new Error("reupload timeout")),
                REUPLOAD_TIMEOUT_MS,
              ),
            ),
          ]);
          return reuploaded;
        } catch (err) {
          this.logger.warn(
            `Media reupload fell back to source URL (${(err as Error).message})`,
          );
          return url;
        }
      }),
    );
  }

  /**
   * Stores an outbound MMS attachment in our own object storage and returns a
   * publicly reachable URL. Telnyx fetches media by URL when sending an MMS, so
   * the file must live somewhere it can reach (R2/S3 in production).
   */
  async uploadOutboundMedia(input: {
    buffer: Buffer;
    contentType: string;
    filename?: string;
  }): Promise<{ url: string }> {
    const storage = UploadFactory.createStorage();
    const extFromName = input.filename?.includes(".")
      ? input.filename.split(".").pop()
      : undefined;
    const extFromType = input.contentType.includes("/")
      ? input.contentType.split("/")[1]?.split("+")[0]
      : undefined;
    const ext = (extFromName || extFromType || "bin")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const key = `inbox-mms/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const url = await storage.uploadBuffer(
      key,
      input.buffer,
      input.contentType,
      ext,
    );
    return { url };
  }

  // ─────────────────────────────────────────────────────────
  // Outbound SMS
  // ─────────────────────────────────────────────────────────

  async sendSms(input: SendSmsInput): Promise<Message> {
    const { ctx } = input;

    if (
      !input.text?.trim() &&
      !(input.mediaUrls && input.mediaUrls.length > 0)
    ) {
      throw new BadRequestException("Message must have text or media");
    }

    if (input.idempotencyKey) {
      const existing = await this.messageRepo.findByIdempotencyKey(
        input.idempotencyKey,
      );
      if (existing) return existing;
    }

    // 1) Validate the Ringee number belongs to this owner.
    const number = await this.numberRepo.findOne({
      phoneNumber: input.fromNumber,
    });
    if (!number) {
      throw new NotFoundException(`Number ${input.fromNumber} not found`);
    }
    if (ctx.organizationId) {
      if (number.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Number does not belong to organization");
      }
    } else if (number.userId !== ctx.userId) {
      throw new ForbiddenException("Number does not belong to user");
    }

    // 2) Validate messaging capability snapshot.
    if (!number.smsEnabled && !(input.mediaUrls?.length && number.mmsEnabled)) {
      throw new BadRequestException(
        "This number does not have messaging enabled",
      );
    }

    // 3) DNC / unsubscribed checks via Contact (best-effort).
    const contact = input.contactId
      ? await this.contactRepo.findById(input.contactId).catch(() => null)
      : await this.contactRepo
          .findByPhone(ctx, input.toNumber)
          .catch(() => null);
    if (contact && (contact.doNotCall || contact.unsubscribed)) {
      throw new BadRequestException("Contact is on DNC / unsubscribed");
    }

    // 4) Resolve thread.
    const thread = await this.inboxService.findOrCreateThread({
      ctx,
      ringeeNumber: input.fromNumber,
      participantNumber: input.toNumber,
      contactId: contact?.id ?? input.contactId ?? null,
    });

    const isMms = !!input.mediaUrls?.length;

    // 5) Persist queued Message.
    const message = await this.messageRepo.create({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      contact: contact ? { connect: { id: contact.id } } : undefined,
      thread: { connect: { id: thread.id } },
      numberId: number.id,
      provider: "telnyx",
      direction: MessageDirection.outbound,
      type: isMms ? MessageType.mms : MessageType.sms,
      status: MessageStatus.queued,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      text: input.text ?? null,
      mediaUrls: input.mediaUrls ?? [],
      idempotencyKey: input.idempotencyKey ?? null,
    });

    // 6) Append the visible InboxEvent immediately (status: sent — Telnyx
    // delivery receipts will refine this later).
    await this.inboxService.appendMessageEvent({
      threadId: thread.id,
      messageId: message.id,
      direction: InboxEventDirection.outbound,
      kind: isMms ? InboxEventKind.mms_sent : InboxEventKind.sms_sent,
      status: InboxEventStatus.sent,
      body: input.text ?? null,
      mediaUrls: input.mediaUrls ?? [],
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      occurredAt: new Date(),
    });

    // 7) Send via Telnyx.
    try {
      const result = await this.telephonyService.sendMessage({
        from: input.fromNumber,
        to: input.toNumber,
        text: input.text,
        mediaUrls: input.mediaUrls,
        type: isMms ? "MMS" : "SMS",
        messagingProfileId: number.providerMessagingProfileId ?? undefined,
      });

      return this.messageRepo.update(message.id, {
        providerMessageId: result.id,
        messagingProfileId: result.messagingProfileId ?? null,
        status: MessageStatus.sent,
        sentAt: new Date(),
        rawPayload: result.raw ?? undefined,
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to send SMS via Telnyx: ${err?.message ?? err}`,
      );
      const updated = await this.messageRepo.update(message.id, {
        status: MessageStatus.failed,
        failedAt: new Date(),
        errorMessage: String(err?.message ?? err),
      });
      // Reflect failure on the existing inbox event.
      await this.inboxService.appendEvent({
        threadId: thread.id,
        direction: InboxEventDirection.system,
        kind: InboxEventKind.message_failed,
        status: InboxEventStatus.failed,
        messageId: updated.id,
        title: "Message failed",
        body: String(err?.message ?? err),
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
      });
      return updated;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Inbound webhook handler
  // ─────────────────────────────────────────────────────────

  /**
   * Handles a Telnyx messaging webhook envelope. Idempotent on
   * `providerEventId`. Updates Message and InboxEvent state for delivery
   * receipts.
   */
  async handleWebhookEvent(envelope: {
    data: {
      id: string;
      event_type: TelnyxMessagingEventType;
      occurred_at: string;
      payload: TelnyxMessagePayload;
    };
  }): Promise<void> {
    const eventId = envelope.data.id;
    const eventType = envelope.data.event_type;
    const payload = envelope.data.payload;

    const existing = await this.messageEventRepo.findByProviderEventId(eventId);
    if (existing?.processedAt) {
      // Already processed.
      return;
    }

    let messageRow: Message | null = null;
    if (payload.id) {
      messageRow = await this.messageRepo.findByProviderId(payload.id);
    }

    const stored = existing
      ? existing
      : await this.messageEventRepo.create({
          providerEventId: eventId,
          provider: "telnyx",
          eventType,
          payload: envelope.data as any,
          occurredAt: new Date(envelope.data.occurred_at),
          ...(messageRow
            ? { message: { connect: { id: messageRow.id } } }
            : {}),
        });

    try {
      switch (eventType) {
        case "message.received":
          await this.handleInbound(payload);
          break;
        case "message.sent":
          if (messageRow) {
            await this.messageRepo.updateStatus(
              messageRow.id,
              MessageStatus.sent,
              {
                sentAt: payload.sent_at
                  ? new Date(payload.sent_at)
                  : new Date(),
              },
            );
          }
          break;
        case "message.finalized":
          if (messageRow) {
            const errors = payload.errors ?? [];
            if (errors.length > 0) {
              await this.messageRepo.updateStatus(
                messageRow.id,
                MessageStatus.failed,
                {
                  failedAt: new Date(),
                  errorCode: errors[0]?.code,
                  errorMessage: errors[0]?.detail ?? errors[0]?.title ?? null,
                },
              );
              if (messageRow.threadId) {
                await this.inboxService.appendEvent({
                  threadId: messageRow.threadId,
                  direction: InboxEventDirection.system,
                  kind: InboxEventKind.message_failed,
                  status: InboxEventStatus.failed,
                  messageId: messageRow.id,
                  title: "Message failed",
                  body: errors[0]?.detail ?? errors[0]?.title ?? null,
                  fromNumber: messageRow.fromNumber,
                  toNumber: messageRow.toNumber,
                });
              }
            } else {
              await this.messageRepo.updateStatus(
                messageRow.id,
                MessageStatus.delivered,
                {
                  deliveredAt: payload.completed_at
                    ? new Date(payload.completed_at)
                    : new Date(),
                },
              );
              if (messageRow.direction === MessageDirection.outbound) {
                await this.chargeMessageCost(messageRow, payload, eventId);
              }
            }
          }
          break;
        case "message.delivery_unconfirmed":
          if (messageRow) {
            await this.messageRepo.updateStatus(
              messageRow.id,
              MessageStatus.delivery_unconfirmed,
            );
          }
          break;
        case "message.failed":
          if (messageRow) {
            const errors = payload.errors ?? [];
            await this.messageRepo.updateStatus(
              messageRow.id,
              MessageStatus.failed,
              {
                failedAt: new Date(),
                errorCode: errors[0]?.code,
                errorMessage: errors[0]?.detail ?? errors[0]?.title ?? null,
              },
            );
          }
          break;
      }

      await this.messageEventRepo.markProcessed(stored.id);
    } catch (err) {
      this.logger.error(
        `Error processing message event ${eventId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Charge the user/organization for an outbound message using the cost
   * Telnyx reports in the `message.finalized` payload. The amount is
   * multiplied by `MESSAGE_PROFIT_MARGIN` (default 0) before being deducted,
   * mirroring how call costs are handled.
   */
  private async chargeMessageCost(
    messageRow: Message,
    payload: TelnyxMessagePayload,
    eventId: string,
  ): Promise<void> {
    const rawAmount = payload.cost?.amount
      ? parseFloat(payload.cost.amount)
      : 0;
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return;
    }
    if (!messageRow.userId) {
      this.logger.warn(
        `Message ${messageRow.id} has no userId; skipping credit charge`,
      );
      return;
    }

    const profitMargin = process.env.MESSAGE_PROFIT_MARGIN
      ? parseFloat(process.env.MESSAGE_PROFIT_MARGIN)
      : 1;
    const totalCost = rawAmount * profitMargin;

    const ctx: OwnershipContext = {
      userId: messageRow.userId,
      organizationId: messageRow.organizationId,
    };

    try {
      if (totalCost > 0) {
        await this.creditService.consumeCredits(ctx, totalCost, {
          idempotencyKey: `message-cost:${messageRow.id}`,
          source: `telnyx.message.finalized:${eventId}`,
        });
      }
      await this.messageRepo.updateCost(messageRow.id, totalCost, {
        rawAmount,
        currency: payload.cost?.currency ?? null,
        profitMargin,
        parts: payload.parts ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Failed to charge message ${messageRow.id}: ${(err as Error).message}`,
      );
    }
  }

  private async handleInbound(payload: TelnyxMessagePayload): Promise<void> {
    const ringeeNumber = payload.to?.[0]?.phone_number;
    const participantNumber = payload.from?.phone_number;
    if (!ringeeNumber || !participantNumber) {
      this.logger.warn(`Inbound message missing from/to: ${payload.id}`);
      return;
    }

    // Find the owning NumberPurchased to derive ownership context.
    const number = await this.numberRepo.findOne({ phoneNumber: ringeeNumber });
    if (!number || !number.userId) {
      this.logger.warn(
        `Inbound to ${ringeeNumber} has no owner — message dropped`,
      );
      return;
    }

    const ctx: OwnershipContext = {
      userId: number.userId,
      organizationId: number.organizationId,
    };

    // Look up contact by phone.
    const contact = await this.contactRepo
      .findByPhone(ctx, participantNumber)
      .catch(() => null);

    const thread = await this.inboxService.findOrCreateThread({
      ctx,
      ringeeNumber,
      participantNumber,
      contactId: contact?.id ?? null,
    });

    // Idempotency: dedupe on providerMessageId.
    let message = await this.messageRepo.findByProviderId(payload.id);
    let persistedMediaUrls: string[];
    if (!message) {
      const isMms = payload.type === "MMS" || (payload.media?.length ?? 0) > 0;
      const sourceUrls = (payload.media ?? []).map((m) => m.url);
      persistedMediaUrls = await this.reuploadMedia(sourceUrls);

      message = await this.messageRepo.create({
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        contact: contact ? { connect: { id: contact.id } } : undefined,
        thread: { connect: { id: thread.id } },
        numberId: number.id,
        provider: "telnyx",
        providerMessageId: payload.id,
        messagingProfileId: payload.messaging_profile_id ?? null,
        direction: MessageDirection.inbound,
        type: isMms ? MessageType.mms : MessageType.sms,
        status: MessageStatus.received,
        fromNumber: participantNumber,
        toNumber: ringeeNumber,
        text: payload.text ?? null,
        mediaUrls: persistedMediaUrls,
        receivedAt: payload.received_at
          ? new Date(payload.received_at)
          : new Date(),
        rawPayload: payload as any,
      });
    } else {
      persistedMediaUrls = message.mediaUrls ?? [];
    }

    const isMms = message.type === MessageType.mms;
    await this.inboxService.appendMessageEvent({
      threadId: thread.id,
      messageId: message.id,
      direction: InboxEventDirection.inbound,
      kind: isMms ? InboxEventKind.mms_received : InboxEventKind.sms_received,
      status: InboxEventStatus.received,
      body: payload.text ?? null,
      mediaUrls: persistedMediaUrls,
      fromNumber: participantNumber,
      toNumber: ringeeNumber,
      occurredAt: payload.received_at
        ? new Date(payload.received_at)
        : new Date(),
      incrementUnread: true,
    });
  }
}
