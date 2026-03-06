import { Injectable, Logger } from "@nestjs/common";
import { CallRepository, CallStatus, Call } from "@ringee/database";
import { NotificationService, WorkerService, OwnershipContext } from "@ringee/platform";
import type {
  TelnyxWebhookEvent,
  CallTranscriptionPayload,
  CallRecordingErrorPayload,
  CallHangupPayload,
  CallCostPayload,
} from "@ringee/platform";
import { CallTranscriptionService } from "./call.transcription.service";
import { UserService } from "./user.service";
import { CreditService } from "./credit.service";
import { ContactService } from "./contact.service";
import { NumberPurchasedService } from "./number.purchased.service";
import { UserDeviceService } from "./user.device.service";
import { OrganizationService } from "./organization.service";

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    private readonly callRepository: CallRepository,
    private readonly transcriptionService: CallTranscriptionService,
    private readonly userService: UserService,
    private readonly creditService: CreditService,
    private readonly contactService: ContactService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly notificationService: NotificationService,
    private readonly userDeviceService: UserDeviceService,
    private readonly workerService: WorkerService,
    private readonly organizationService: OrganizationService,
  ) { }

  async findOneBySessionId(callSessionId: string): Promise<Call | null> {
    return this.callRepository.findOneBySessionId(callSessionId);
  }

  async findByControlId(callControlId: string): Promise<Call | null> {
    return this.callRepository.findByControlId(callControlId);
  }

  async listByOwnerPaginated(
    ctx: OwnershipContext,
    options: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
      orderBy?: "createdAt" | "startedAt" | "endedAt";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.callRepository.listByOwnerPaginated(ctx, options);
  }

  async listWithRecordings(params: {
    ctx: OwnershipContext;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.callRepository.listWithRecordings(params);
  }

  getClerkUserIdFromHeaders(headers: any): string {
    return Array.isArray(headers)
      ? headers?.find((header: any) => header.name === "X-User-Id")?.value
      : "";
  }

  async getOrganizationIdFromHeaders(headers: any): Promise<string | null> {
    const clerkOrganizationId = Array.isArray(headers)
      ? headers?.find((header: any) => header.name === "X-Organization-Id")?.value || null
      : null;

    if (!clerkOrganizationId) {
      return null;
    }

    const organization = await this.organizationService.getByClerkId(clerkOrganizationId);

    return organization?.id || null;
  }

  async handleTelnyxEvent(event: TelnyxWebhookEvent) {
    const { event_type, payload } = event;

    const callControlId = payload?.call_control_id;

    if (!callControlId) {
      this.logger.warn(`⚠️ Evento ${event_type} sin call_control_id`);
      return;
    }

    this.logger.debug(`📨 Evento Telnyx recibido: ${event_type}`);

    switch (event_type) {
      case "call.initiated":
        if (["inbound", "incoming"].includes(payload.direction || "")) {
          const number = await this.numberPurchasedService.findOneByNumber(
            payload.to!,
          );

          if (!number) {
            this.logger.warn(`⚠️ Number ${payload.to} not found`);
            return;
          }

          const user = await this.userService.getUserById(number.userId!);

          if (!user) {
            this.logger.warn(
              `⚠️ User ${number.userId} not found - ${payload.direction}`,
            );
            return;
          }

          // Build ownership context from the number's owner
          const ctx: OwnershipContext = {
            userId: user.id,
            organizationId: number.organizationId,
          };

          const contact = await this.contactService.findByPhone(
            ctx,
            payload.from!,
          );

          await this.callRepository.createCall(ctx, {
            contact: contact ? { connect: { id: contact.id } } : undefined,
            fromNumber: payload.from!,
            toNumber: payload.to!,
            connectionId: process.env.TELNYX_CONNECTION_ID!,
            callControlId,
            direction: payload.direction || "outbound",
            callSessionId: payload.call_session_id!,
            callLegId: payload.call_leg_id!,
            status: CallStatus.ringing,
            startedAt: payload.start_time!,
            clientState: Buffer.from("initiate_call").toString("base64"),
          });

          const devices = await this.userDeviceService.findActiveByUser(
            user.id,
          );

          devices.length > 0 &&
            (await Promise.allSettled(
              devices.map((device) => {
                return this.notificationService.sendNotification(
                  device.fcmToken,
                  {
                    title: "📞 Incoming Call",
                    body: `Call from ${contact?.name || payload.from}`,
                    data: {
                      type: "INCOMING_CALL",
                      callerNumber: payload.from!,
                      toNumber: payload.to!,
                      clerkUserId: user.clerkId!,
                      userId: user.id,
                      callSessionId: payload.call_session_id!,
                      callControlId: payload.call_control_id!,
                      url: `/dashboard/call?control=${payload.call_session_id!}`,
                      title: "📞 Incoming Call",
                    },
                  },
                );
              }),
            ));

          return;
        }

        const userId = this.getClerkUserIdFromHeaders(payload.custom_headers);
        const organizationId = await this.getOrganizationIdFromHeaders(payload.custom_headers);
        const user = await this.userService.getByClerkId(userId);

        if (!user) {
          this.logger.warn(`⚠️ User ${userId} not found`);
          return;
        }

        // For outbound calls, build context from the calling user
        const outboundCtx: OwnershipContext = {
          userId: user.id,
          organizationId: organizationId,
        };

        const contact = await this.contactService.findByPhone(
          outboundCtx,
          payload.to!,
        );

        await this.callRepository.createCall(outboundCtx, {
          contact: contact ? { connect: { id: contact.id } } : undefined,
          fromNumber: payload.from!,
          toNumber: payload.to!,
          connectionId: process.env.TELNYX_CONNECTION_ID!,
          callControlId,
          direction: payload.direction || "outbound",
          callSessionId: payload.call_session_id!,
          callLegId: payload.call_leg_id!,
          status: CallStatus.ringing,
          startedAt: payload.start_time!,
          clientState: Buffer.from("initiate_call").toString("base64"),
        });
        this.logger.log(`📞 Llamada ${callControlId} iniciada`);
        break;

      case "call.answered":
        await this.callRepository.updateStatus(
          callControlId,
          CallStatus.answered,
        );
        break;

      case "call.hangup": {
        const hangupPayload = payload as CallHangupPayload;

        await this.callRepository.completeCall(
          callControlId,
          hangupPayload.start_time!,
          hangupPayload.end_time!,
        );
        break;
      }

      case "call.recording.saved": {
        this.logger.debug(`💾 Recording saved payload: ${JSON.stringify(payload)}`);
        try {
          await this.workerService.processCallRecording({
            callControlId,
            recording: {
              publicUrl: payload.recording_urls?.mp3,
              privateUrl: payload.recording_urls?.mp3,
              recordingStartedAt: payload.recording_started_at,
              recordingEndedAt: payload.recording_ended_at,
            },
          });
        } catch (error) {
          this.logger.error(`❌ Error processing call recording: ${JSON.stringify(error, null, 2)}`);
        }
        break;
      }

      case "call.recording.error": {
        const errorPayload = payload as CallRecordingErrorPayload;
        await this.callRepository.updateControlState(callControlId, {
          errorMessage: errorPayload.error,
          lastEventType: event_type,
        });
        break;
      }

      case "call.transcription": {
        const transcriptPayload = payload as CallTranscriptionPayload;
        const call = await this.callRepository.findByControlId(callControlId);

        if (!call) {
          this.logger.warn(`⚠️ Llamada ${callControlId} no encontrada`);
          return;
        }

        await this.transcriptionService.handleTranscriptionEvent(
          callControlId,
          transcriptPayload.transcription,
          call.id,
          transcriptPayload.track!,
          transcriptPayload.speaker!,
          transcriptPayload.is_final,
        );
        break;
      }
      case "call.cost": {
        try {
          const costPayload = payload as CallCostPayload;
          const call = await this.callRepository.findByControlId(callControlId);

          if (!call) {
            this.logger.warn(`⚠️ Llamada ${callControlId} no encontrada`);
            return;
          }

          const user = await this.userService.getUserById(call.userId!);

          if (!user) {
            this.logger.warn(`⚠️ Usuario ${call.userId} no encontrado`);
            return;
          }

          const rawTotalCost = parseFloat(costPayload.total_cost);
          const totalCost = rawTotalCost * 1.5;

          // Build context from call's ownership
          const callCtx: OwnershipContext = {
            userId: call.userId!,
            organizationId: call.organizationId,
          };

          if (user.freeCallTrial) {
            await this.userService.consumeFreeCallTrial(user.id);
          } else {
            await this.creditService.consumeCredits(callCtx, totalCost);
          }

          await this.callRepository.updateCost(
            callControlId,
            totalCost,
            payload,
          );
          break;
        } catch (error) {
          console.error("Error processing call cost:", error);
          throw error;
        }
      }

      default:
        await this.callRepository.logEvent(callControlId, event_type, payload);
        break;
    }
  }
}
