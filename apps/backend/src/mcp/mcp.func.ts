import { Injectable, Logger } from "@nestjs/common";
import {
  CallService,
  CallbackService,
  ContactService,
  MeetingService,
  UserDeviceService,
} from "@ringee/services";
import {
  NotificationService,
  OwnershipContext,
} from "@ringee/platform";
import { CallOutcome } from "@ringee/database";
import { McpTool } from "./mcp.tools";
import {
  CreateCallbackInput,
  CreateCallbackSchema,
  GetContactInput,
  GetContactSchema,
  LogCallOutcomeInput,
  LogCallOutcomeSchema,
  ScheduleMeetingInput,
  ScheduleMeetingSchema,
  SearchContactsInput,
  SearchContactsSchema,
  StartCallInput,
  StartCallSchema,
} from "./mcp.zod";

type Content = { type: "text"; text: string };

const text = (value: unknown): Content[] => [
  {
    type: "text",
    text:
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
  },
];

@Injectable()
export class McpFunc {
  private readonly logger = new Logger(McpFunc.name);

  constructor(
    private readonly contactService: ContactService,
    private readonly callService: CallService,
    private readonly callbackService: CallbackService,
    private readonly meetingService: MeetingService,
    private readonly userDeviceService: UserDeviceService,
    private readonly notificationService: NotificationService,
  ) {}

  @McpTool({
    toolName: "search_contacts",
    description:
      "Search the user's (or organization's) Ringee contact directory by name, phone, email, or company. " +
      "Returns a paginated list of matching contacts with their id, name, phone, email and lastCallAt. " +
      "Use this to resolve a contactId before calling start_call, create_callback, or schedule_meeting.",
    zod: SearchContactsSchema,
  })
  async searchContacts(ctx: OwnershipContext, input: SearchContactsInput) {
    const { data, meta } = await this.contactService.listContacts(
      ctx,
      input.query,
      undefined,
      input.page ?? 1,
      input.limit ?? 10,
    );

    return text({
      total: meta.total,
      page: meta.page,
      totalPages: meta.totalPages,
      contacts: data.map((c) => ({
        id: c.id,
        name: c.name,
        firstName: c.firstName,
        lastName: c.lastName,
        phoneNumber: c.phoneNumber,
        email: c.email,
        company: c.company,
        jobTitle: c.jobTitle,
        lastCallAt: c.lastCallAt,
      })),
    });
  }

  @McpTool({
    toolName: "get_contact",
    description:
      "Fetch the full record for a single contact, including recent calls, notes, meetings and tags. " +
      "Call this when the user asks for details or when you need history before placing a follow-up call.",
    zod: GetContactSchema,
  })
  async getContact(_ctx: OwnershipContext, input: GetContactInput) {
    const contact = await this.contactService.getContactActivities(
      input.contactId,
    );
    return text(contact);
  }

  @McpTool({
    toolName: "start_call",
    description:
      "Place an outbound call from the user's Ringee app. " +
      "Because calls are dialed in the user's browser/mobile via WebRTC, this tool sends a push " +
      "notification to the user's active devices instructing them to dial. " +
      "Provide either contactId (preferred) or a raw phoneNumber in E.164 format. " +
      "Returns whether a device was notified.",
    zod: StartCallSchema,
  })
  async startCall(ctx: OwnershipContext, input: StartCallInput) {
    if (!input.contactId && !input.phoneNumber) {
      return text({
        ok: false,
        error: "Either contactId or phoneNumber is required.",
      });
    }

    let phoneNumber = input.phoneNumber ?? null;
    let contactName: string | null = null;
    let contactId: string | null = input.contactId ?? null;

    if (input.contactId) {
      const contact = await this.contactService.getContactById(input.contactId);
      phoneNumber = contact.phoneNumber;
      contactName = contact.name ?? null;
      contactId = contact.id;
    }

    if (!phoneNumber) {
      return text({ ok: false, error: "Contact has no phone number." });
    }

    const devices = await this.userDeviceService.findActiveByUser(ctx.userId);

    if (devices.length === 0) {
      return text({
        ok: false,
        notified: 0,
        error:
          "User has no active devices. Ask them to open the Ringee app and try again.",
      });
    }

    const title = "📞 Ringee — Start call";
    const body = contactName
      ? `Tap to dial ${contactName} (${phoneNumber})`
      : `Tap to dial ${phoneNumber}`;

    const results = await Promise.allSettled(
      devices.map((device) =>
        this.notificationService.sendNotification(device.fcmToken, {
          title,
          body,
          data: {
            type: "MCP_START_CALL",
            phoneNumber,
            contactId: contactId ?? "",
            organizationId: ctx.organizationId ?? "",
            note: input.note ?? "",
            url: `/dashboard/call?dial=${encodeURIComponent(phoneNumber)}`,
          },
        }),
      ),
    );

    const notified = results.filter((r) => r.status === "fulfilled").length;

    return text({
      ok: notified > 0,
      notified,
      totalDevices: devices.length,
      phoneNumber,
      contactId,
    });
  }

  @McpTool({
    toolName: "log_call_outcome",
    description:
      "Record the outcome of a past call (e.g. meeting_booked, interested, voicemail). " +
      "Use after the user describes how a call went. The call must belong to the current user/organization.",
    zod: LogCallOutcomeSchema,
  })
  async logCallOutcome(ctx: OwnershipContext, input: LogCallOutcomeInput) {
    const updated = await this.meetingService.updateCallOutcome(
      ctx,
      input.callId,
      {
        outcome: input.outcome as CallOutcome,
        outcomeNote: input.outcomeNote,
      },
    );

    return text({
      ok: true,
      callId: updated.id,
      outcome: updated.outcome,
      outcomeNote: updated.outcomeNote,
    });
  }

  @McpTool({
    toolName: "create_callback",
    description:
      "Schedule a reminder to call a contact back at a specific future time. " +
      "Creates a callback task and a reminder. Returns the callback id and scheduled time.",
    zod: CreateCallbackSchema,
  })
  async createCallback(ctx: OwnershipContext, input: CreateCallbackInput) {
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return text({ ok: false, error: "Invalid scheduledAt datetime." });
    }
    if (scheduledAt.getTime() <= Date.now()) {
      return text({ ok: false, error: "scheduledAt must be in the future." });
    }

    const callback = await this.callbackService.scheduleFromContact({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      contactId: input.contactId,
      callId: input.callId ?? null,
      scheduledAt,
      note: input.note,
    });

    return text({
      ok: true,
      callbackId: callback.id,
      scheduledAt: callback.scheduledAt,
      status: callback.status,
    });
  }

  @McpTool({
    toolName: "schedule_meeting",
    description:
      "Book a meeting with a contact. When the user has a Google/Microsoft calendar connected, " +
      "the event is synced and a Meet/Teams link is generated. " +
      "Provide attendeeEmail to send a calendar invite.",
    zod: ScheduleMeetingSchema,
  })
  async scheduleMeeting(ctx: OwnershipContext, input: ScheduleMeetingInput) {
    const meeting = await this.meetingService.createMeeting(ctx, {
      contactId: input.contactId,
      callId: input.callId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      duration: input.duration,
      location: input.location,
      notes: input.notes,
      attendeeEmail: input.attendeeEmail,
      calendarProvider: input.calendarProvider,
    });

    return text({
      ok: true,
      meetingId: meeting.id,
      scheduledAt: meeting.scheduledAt,
      duration: meeting.duration,
      status: meeting.status,
    });
  }
}
