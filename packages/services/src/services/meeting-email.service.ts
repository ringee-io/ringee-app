import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AiVoiceAgentCallRepository,
  AiVoiceAgentRepository,
  CalendarRepository,
  Contact,
  Meeting,
  MeetingEmailDelivery,
  MeetingEmailDeliveryRepository,
  MeetingEmailDeliveryStatus,
  MeetingEmailKind,
  MeetingRepository,
  MeetingStatus,
  Prisma,
  OrganizationRepository,
  User,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  EMAIL_PROVIDER,
  type EmailMessage,
  type EmailInterface,
  type OrganizationOwnershipContext,
} from "@ringee/platform";
import {
  automationOrganizationFilter,
  voiceAgentAutomationsEnabled,
} from "./voice-agents/automations/automation-access";
import { normalizeEmail } from "./meeting.service";
import { CompanyProfileService } from "./voice-agents/company-profile.service";

const D = MeetingEmailDeliveryStatus;

/** How long a worker owns a delivery it is sending. */
const LEASE_MS = 5 * 60_000;
const BATCH = 25;
/** Tries before a delivery is left for a person to look at. */
const MAX_ATTEMPTS = 8;
/** How long after sending the provider is asked for the Message-ID. */
const MESSAGE_ID_BACKFILL_MS = 24 * 60 * 60_000;

type UserWithEmails = User & { emails?: UserEmail[] };

/** Everyone a meeting email is about or addressed to, resolved at send time. */
export interface MeetingEmailPeople {
  /** The member the meeting is with — a current member, or null. */
  responsible: UserWithEmails | null;
  /** Whoever created the meeting, when it is a different current member. */
  creator: UserWithEmails | null;
  admins: UserWithEmails[];
}

/**
 * Delivers the meeting emails an attendance answer owes (AGENT-020).
 *
 * One email per answer, not one per person: the lead and the member are in
 * To, the organization's admins in CC — de-duplicated across the two — and
 * Reply-To is the member, so a reply reaches the person the meeting is with
 * and "reply all" keeps everyone on the same thread. Recipients are resolved
 * here, at send time, from the meeting and the organization as they are now:
 * a member who left is never written to, and nothing a client sent is treated
 * as a list of who may read it.
 *
 * Delivery is durable. The row was created with the answer; this worker
 * claims it under a lease, sends it under its own id as the provider's
 * idempotency key, and records what the provider said. "Sent" is only ever
 * the provider having accepted it.
 */
@Injectable()
export class MeetingEmailService {
  private readonly logger = new Logger(MeetingEmailService.name);
  private now(): Date {
    return new Date();
  }

  constructor(
    private readonly deliveries: MeetingEmailDeliveryRepository,
    private readonly meetings: MeetingRepository,
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly agents: AiVoiceAgentRepository,
    private readonly calendars: CalendarRepository,
    private readonly companyProfiles: CompanyProfileService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailInterface,
  ) {}

  /** Worker entry point, on the reminder schedule's tick. */
  async drain(now = new Date()): Promise<number> {
    const organizations = automationOrganizationFilter();
    if (organizations?.length === 0) return 0;
    await this.backfillMessageIds(now);
    const claimAt = this.now();
    const claimed = await this.deliveries.claimDue(
      claimAt,
      new Date(claimAt.getTime() + LEASE_MS),
      BATCH,
      organizations,
    );
    let sent = 0;
    for (const delivery of claimed) {
      try {
        if (await this.deliver(delivery)) sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Meeting email ${delivery.id} failed: ${message}`);
        await this.deliveries.release(
          delivery.id,
          delivery.attempts >= MAX_ATTEMPTS ? D.failed : D.pending,
          message,
          delivery.claimToken!,
        );
      }
    }
    return sent;
  }

  /** Who a meeting's email goes to, as of now. */
  async people(meeting: Meeting): Promise<MeetingEmailPeople> {
    const organizationId = meeting.organizationId;
    if (!organizationId)
      return { responsible: null, creator: null, admins: [] };

    // The human who created the meeting: whoever started the booking call
    // when an agent booked it, otherwise the meeting's owner.
    const bookingCall = await this.agentCalls.findByMeetingId(meeting.id);
    const creatorId = bookingCall?.userId ?? meeting.userId;
    const responsibleId = meeting.responsibleUserId ?? creatorId;

    const member = async (userId: string | null) => {
      if (!userId) return null;
      if (!(await this.organizations.isMember(userId, organizationId))) {
        return null;
      }
      return (await this.users.findById(userId)) as UserWithEmails | null;
    };

    const [responsible, creator, admins] = await Promise.all([
      member(responsibleId),
      creatorId !== responsibleId ? member(creatorId) : Promise.resolve(null),
      this.organizations.findAdminMembersWithEmails(organizationId),
    ]);
    return { responsible, creator, admins };
  }

  private async deliver(delivery: MeetingEmailDelivery): Promise<boolean> {
    if (!delivery.claimToken) return false;
    const release = (status: MeetingEmailDeliveryStatus, reason: string) =>
      this.deliveries.release(
        delivery.id,
        status,
        reason,
        delivery.claimToken!,
      );
    if (!voiceAgentAutomationsEnabled(delivery.organizationId)) {
      await release(D.pending, "automations_disabled");
      return false;
    }
    // A timeout or failed database acknowledgment may already have sent it.
    // Keep margin before the provider expires the key; never reset this clock.
    const safeWindow = Math.max(
      0,
      (this.email.idempotencyWindowMs ?? 0) - 5 * 60_000,
    );
    if (
      delivery.firstAttemptAt &&
      (!delivery.sendPayload ||
        this.now().getTime() - delivery.firstAttemptAt.getTime() >= safeWindow)
    ) {
      await release(
        D.failed,
        "Delivery may already have been sent; the provider idempotency window expired. Reconcile before retrying.",
      );
      return false;
    }
    const meeting = (await this.meetings.findById(delivery.meetingId)) as
      | (Meeting & { contact?: Contact | null })
      | null;
    if (!meeting || meeting.organizationId !== delivery.organizationId) {
      await this.deliveries.release(
        delivery.id,
        D.cancelled,
        "meeting_missing",
        delivery.claimToken,
      );
      return false;
    }
    if (
      meeting.status !== MeetingStatus.scheduled &&
      meeting.status !== MeetingStatus.rescheduled
    ) {
      await this.deliveries.release(
        delivery.id,
        D.cancelled,
        "meeting_cancelled",
        delivery.claimToken,
      );
      return false;
    }

    const expectedAttendance =
      delivery.kind === MeetingEmailKind.attendance_confirmed
        ? "confirmed"
        : "declined";
    if (
      meeting.attendanceScheduleVersion !== delivery.scheduleVersion ||
      meeting.attendanceStatus !== expectedAttendance
    ) {
      await release(D.cancelled, "attendance_changed");
      return false;
    }
    const people = await this.people(meeting);
    const memberEmail = primaryEmail(people.responsible);
    if (!people.responsible || !memberEmail) {
      // Never write to someone who left; an admin reassigns the meeting and
      // the email goes out then.
      await this.deliveries.release(
        delivery.id,
        D.needs_member,
        "The member this meeting is with is no longer in the organization.",
        delivery.claimToken,
      );
      return false;
    }

    const leadEmail = normalizeEmail(
      meeting.leadEmail ?? meeting.contact?.email ?? null,
    );
    const confirmation =
      delivery.kind === MeetingEmailKind.attendance_confirmed;
    if (confirmation && !leadEmail) {
      await this.deliveries.release(
        delivery.id,
        D.needs_email,
        "There is no email address for the lead yet.",
        delivery.claimToken,
      );
      return false;
    }

    const to = unique([
      ...(confirmation && leadEmail ? [leadEmail] : []),
      memberEmail,
      ...(people.creator ? [primaryEmail(people.creator)] : []),
    ]);
    const cc = unique(people.admins.map(primaryEmail)).filter(
      (address) => !to.includes(address),
    );

    const ctx: OrganizationOwnershipContext = {
      userId: meeting.userId,
      organizationId: meeting.organizationId!,
    };
    const { language, company } = await this.voiceOf(ctx, meeting);
    const timeZone = await this.timeZoneOf(ctx, meeting);
    const content = composeMeetingEmail({
      kind: delivery.kind,
      language,
      company,
      meeting,
      leadName: contactName(meeting.contact),
      leadPhone: meeting.contact?.phoneNumber ?? null,
      leadEmail,
      memberName: displayName(people.responsible),
      timeZone,
    });

    // The next email about a meeting threads under the last one sent.
    const previous = await this.deliveries.findLatestSentForMeeting(
      meeting.id,
      delivery.id,
    );
    const inReplyTo = previous?.messageId ?? null;
    const subject = previous?.subject
      ? `Re: ${previous.subject.replace(/^(Re:\s*)+/i, "")}`
      : content.subject;

    const proposed: EmailMessage = {
      to,
      cc,
      subject,
      html: content.html,
      text: content.text,
      fromName: company ? `${company} via Ringee` : "Ringee",
      replyTo: memberEmail,
      headers: inReplyTo
        ? { "In-Reply-To": inReplyTo, References: inReplyTo }
        : undefined,
      idempotencyKey: delivery.id,
    };
    const frozen = delivery.sendPayload as unknown as EmailMessage | null;
    if (
      frozen &&
      (JSON.stringify([...frozen.to].sort()) !==
        JSON.stringify([...to].sort()) ||
        JSON.stringify([...(frozen.cc ?? [])].sort()) !==
          JSON.stringify([...cc].sort()) ||
        frozen.replyTo !== memberEmail)
    ) {
      await release(
        D.failed,
        "Recipients changed after an uncertain send; reconcile the original delivery before retrying.",
      );
      return false;
    }
    if (!voiceAgentAutomationsEnabled(delivery.organizationId)) {
      await release(D.pending, "automations_disabled");
      return false;
    }
    const atSend = this.now();
    if (
      delivery.firstAttemptAt &&
      atSend.getTime() - delivery.firstAttemptAt.getTime() >= safeWindow
    ) {
      await release(
        D.failed,
        "Provider idempotency window expired during preparation; reconcile before retrying.",
      );
      return false;
    }
    const prepared = await this.deliveries.prepareSend(
      delivery,
      meeting.scheduleVersion,
      atSend,
      JSON.parse(JSON.stringify(proposed)) as Prisma.InputJsonObject,
    );
    if (!prepared) {
      await release(D.pending, "meeting_or_claim_changed");
      return false;
    }
    const message = prepared.sendPayload as unknown as EmailMessage;
    const result = await this.email.send(message);

    if (!result.accepted) {
      const exhausted = !result.retryable || delivery.attempts >= MAX_ATTEMPTS;
      await this.deliveries.release(
        delivery.id,
        exhausted ? D.failed : D.pending,
        result.error,
        delivery.claimToken,
      );
      return false;
    }

    // Persist acceptance before any further provider request. Message-ID is
    // recovered by the existing backfill, which cannot cause another send.
    await this.deliveries.markSent(
      delivery.id,
      {
        providerEmailId: result.providerEmailId,
        messageId: null,
        toAddresses: message.to,
        ccAddresses: message.cc ?? [],
        replyTo: typeof message.replyTo === "string" ? message.replyTo : null,
        subject: message.subject,
        inReplyTo: message.headers?.["In-Reply-To"] ?? null,
      },
      delivery.claimToken,
    );
    return true;
  }

  /**
   * The provider reports an email's Message-ID a moment after accepting it.
   * Asked again for a day, so the next email about the meeting can thread.
   */
  private async backfillMessageIds(now: Date): Promise<void> {
    const missing = await this.deliveries.listMissingMessageId(
      new Date(now.getTime() - MESSAGE_ID_BACKFILL_MS),
    );
    for (const delivery of missing) {
      const messageId = await this.email.getMessageId(
        delivery.providerEmailId!,
      );
      if (messageId) await this.deliveries.setMessageId(delivery.id, messageId);
    }
  }

  /**
   * The language the lead was spoken to in, and the company the agent speaks
   * for — the same voice the call had.
   */
  private async voiceOf(
    ctx: OrganizationOwnershipContext,
    meeting: Meeting,
  ): Promise<{ language: string; company: string | null }> {
    const call = meeting.attendanceAgentCallId
      ? await this.agentCalls.findById(meeting.attendanceAgentCallId)
      : null;
    const agent = call
      ? await this.agents.findByIdForOwner(ctx, call.agentId)
      : null;
    if (!agent) {
      const organization = await this.organizations.findById(
        ctx.organizationId,
      );
      return { language: "en", company: organization?.name ?? null };
    }
    const company = await this.companyProfiles
      .resolveForAgent(ctx, agent)
      .catch(() => null);
    return {
      language: agent.voiceLanguage ?? "en",
      company: company?.name?.trim() || null,
    };
  }

  private async timeZoneOf(
    ctx: OrganizationOwnershipContext,
    meeting: Meeting,
  ): Promise<string> {
    const calendar = meeting.calendarId
      ? await this.calendars.findByIdForOwner(ctx, meeting.calendarId)
      : await this.calendars.findDefault(ctx);
    return calendar?.timezone ?? "UTC";
  }
}

// ── Composition ──────────────────────────────────────────────────────

const LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
};

interface EmailRow {
  label: string;
  value: string;
  link?: string;
}

interface Copy {
  confirmedSubject: (title: string, when: string) => string;
  declinedSubject: (title: string, when: string) => string;
  confirmed: (lead: string) => string;
  declined: (lead: string) => string;
  when: string;
  with: string;
  where: string;
  note: string;
  contact: string;
  reply: (member: string) => string;
  footer: (company: string) => string;
  meeting: string;
  someone: string;
}

const COPY: Record<string, Copy> = {
  en: {
    confirmedSubject: (title, when) => `Confirmed: ${title} — ${when}`,
    declinedSubject: (title, when) => `Can't attend: ${title} — ${when}`,
    confirmed: (lead) => `${lead} confirmed they will attend.`,
    declined: (lead) => `${lead} said they can't attend.`,
    when: "When",
    with: "With",
    where: "Where",
    note: "What they said",
    contact: "Contact",
    reply: (member) => `Reply to this email to reach ${member}.`,
    footer: (company) => `Sent by Ringee on behalf of ${company}.`,
    meeting: "Meeting",
    someone: "The lead",
  },
  es: {
    confirmedSubject: (title, when) => `Confirmada: ${title} — ${when}`,
    declinedSubject: (title, when) => `No podrá asistir: ${title} — ${when}`,
    confirmed: (lead) => `${lead} confirmó su asistencia.`,
    declined: (lead) => `${lead} dijo que no podrá asistir.`,
    when: "Cuándo",
    with: "Con",
    where: "Dónde",
    note: "Lo que dijo",
    contact: "Contacto",
    reply: (member) => `Responde a este correo para escribir a ${member}.`,
    footer: (company) => `Enviado por Ringee en nombre de ${company}.`,
    meeting: "Reunión",
    someone: "El contacto",
  },
  pt: {
    confirmedSubject: (title, when) => `Confirmada: ${title} — ${when}`,
    declinedSubject: (title, when) =>
      `Não poderá comparecer: ${title} — ${when}`,
    confirmed: (lead) => `${lead} confirmou presença.`,
    declined: (lead) => `${lead} disse que não poderá comparecer.`,
    when: "Quando",
    with: "Com",
    where: "Onde",
    note: "O que disse",
    contact: "Contato",
    reply: (member) => `Responda a este e-mail para falar com ${member}.`,
    footer: (company) => `Enviado pela Ringee em nome de ${company}.`,
    meeting: "Reunião",
    someone: "O contato",
  },
  fr: {
    confirmedSubject: (title, when) => `Confirmé : ${title} — ${when}`,
    declinedSubject: (title, when) => `Absence : ${title} — ${when}`,
    confirmed: (lead) => `${lead} a confirmé sa présence.`,
    declined: (lead) => `${lead} a indiqué ne pas pouvoir venir.`,
    when: "Quand",
    with: "Avec",
    where: "Où",
    note: "Ce qui a été dit",
    contact: "Contact",
    reply: (member) => `Répondez à cet e-mail pour joindre ${member}.`,
    footer: (company) => `Envoyé par Ringee au nom de ${company}.`,
    meeting: "Rendez-vous",
    someone: "Le contact",
  },
  de: {
    confirmedSubject: (title, when) => `Bestätigt: ${title} — ${when}`,
    declinedSubject: (title, when) => `Absage: ${title} — ${when}`,
    confirmed: (lead) => `${lead} hat die Teilnahme bestätigt.`,
    declined: (lead) => `${lead} kann nicht teilnehmen.`,
    when: "Wann",
    with: "Mit",
    where: "Wo",
    note: "Was gesagt wurde",
    contact: "Kontakt",
    reply: (member) =>
      `Antworten Sie auf diese E-Mail, um ${member} zu erreichen.`,
    footer: (company) => `Von Ringee im Auftrag von ${company} gesendet.`,
    meeting: "Termin",
    someone: "Der Kontakt",
  },
  it: {
    confirmedSubject: (title, when) => `Confermato: ${title} — ${when}`,
    declinedSubject: (title, when) =>
      `Non potrà partecipare: ${title} — ${when}`,
    confirmed: (lead) => `${lead} ha confermato la partecipazione.`,
    declined: (lead) => `${lead} ha detto che non potrà partecipare.`,
    when: "Quando",
    with: "Con",
    where: "Dove",
    note: "Cosa ha detto",
    contact: "Contatto",
    reply: (member) => `Rispondi a questa email per scrivere a ${member}.`,
    footer: (company) => `Inviato da Ringee per conto di ${company}.`,
    meeting: "Appuntamento",
    someone: "Il contatto",
  },
};

/**
 * The email itself: what was answered, when, with whom and where — nothing
 * from the recording, the transcript or any internal summary.
 */
export function composeMeetingEmail(input: {
  kind: MeetingEmailKind;
  language: string;
  company: string | null;
  meeting: Pick<
    Meeting,
    "title" | "scheduledAt" | "location" | "attendanceNote"
  >;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  memberName: string;
  timeZone: string;
}): { subject: string; html: string; text: string } {
  const base = input.language.split("-")[0]!.toLowerCase();
  const copy = COPY[base] ?? COPY.en!;
  const locale = LOCALES[base] ?? "en-US";
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: input.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(input.meeting.scheduledAt);
  const shortWhen = new Intl.DateTimeFormat(locale, {
    timeZone: input.timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(input.meeting.scheduledAt);
  const title = input.meeting.title?.trim() || copy.meeting;
  const lead = input.leadName?.trim() || copy.someone;
  const confirmed = input.kind === MeetingEmailKind.attendance_confirmed;
  const location = input.meeting.location?.trim() || null;
  const isLink = location ? /^https?:\/\//i.test(location) : false;

  const rows: EmailRow[] = [
    { label: copy.when, value: when },
    { label: copy.with, value: input.memberName },
  ];
  if (location) {
    rows.push({
      label: copy.where,
      value: location,
      link: isLink ? location : undefined,
    });
  }
  if (!confirmed) {
    const note = input.meeting.attendanceNote?.trim();
    if (note) rows.push({ label: copy.note, value: note });
    const reach = [input.leadPhone, input.leadEmail]
      .filter(Boolean)
      .join(" · ");
    if (reach) rows.push({ label: copy.contact, value: reach });
  }

  const headline = confirmed ? copy.confirmed(lead) : copy.declined(lead);
  const subject = confirmed
    ? copy.confirmedSubject(title, shortWhen)
    : copy.declinedSubject(title, shortWhen);
  const footer = [
    copy.reply(input.memberName),
    input.company ? copy.footer(input.company) : null,
  ].filter(Boolean);

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:600px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 12px;">${escapeHtml(headline)}</p>
      <p style="margin:0 0 12px;"><strong>${escapeHtml(title)}</strong></p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        ${rows
          .map(
            ({ label, value, link }) =>
              `<tr><td style="padding:4px 16px 4px 0;color:#737373;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:4px 0;">${
                link
                  ? `<a href="${escapeHtml(link)}">${escapeHtml(value)}</a>`
                  : escapeHtml(value)
              }</td></tr>`,
          )
          .join("")}
      </table>
      ${footer
        .map(
          (line) =>
            `<p style="color:#737373;font-size:13px;margin:4px 0;">${escapeHtml(line!)}</p>`,
        )
        .join("")}
    </div>
  `;
  const text = [
    headline,
    "",
    title,
    ...rows.map(({ label, value }) => `${label}: ${value}`),
    "",
    ...footer,
  ].join("\n");

  return { subject, html, text };
}

function primaryEmail(user: UserWithEmails | null): string {
  const address =
    user?.emails?.find((email) => email.isPrimary)?.email ??
    user?.emails?.[0]?.email ??
    null;
  return normalizeEmail(address) ?? "";
}

function displayName(user: UserWithEmails | null): string {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    primaryEmail(user)
  );
}

function contactName(contact: Contact | null | undefined): string | null {
  if (!contact) return null;
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    null
  );
}

function unique(addresses: string[]): string[] {
  return [...new Set(addresses.filter(Boolean))];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
