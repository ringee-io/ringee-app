import type {
  CallSessionInfo,
  ContactDetail,
  CreateCallbackResult,
  LogCallOutcomeResult,
  ScheduleMeetingResult,
  SearchContactsResult,
  SearchLeadsResult,
} from "@ringee-io/agent";
import {
  CallOutcomeCard,
  CallSessionCard,
  CallbackCard,
  ContactCard,
  ContactListCard,
  LeadSearchResults,
  MeetingCard,
} from "@/components/cards";
import {
  ContactCardSkeleton,
  GenericCardSkeleton,
  ListCardSkeleton,
} from "@/components/skeletons";
import {
  mockCallback,
  mockContact,
  mockContactList,
  mockLeadSearch,
  mockMeeting,
  mockOutcome,
  mockSession,
  mockSessionJoinUrl,
} from "@/lib/mock";

/**
 * Maps a ChatGPT App component name to: a renderer (from tool output), a
 * loading skeleton, demo data, and a label. The render route and gallery both
 * use this so a component looks identical whether driven by ChatGPT or by the
 * local demo data.
 *
 * Component names line up with `component` in `@ringee-io/agent`'s TOOL_CATALOG.
 */
export interface ComponentEntry {
  name: string;
  title: string;
  description: string;
  /** Tools whose output this component renders. */
  tools: string[];
  render: (data: unknown) => React.ReactNode;
  /** Placeholder shown in the widget while the tool runs (no real data yet). */
  skeleton: React.ReactNode;
  mock: unknown;
}

const asRecord = (data: unknown): Record<string, unknown> =>
  data && typeof data === "object" ? (data as Record<string, unknown>) : {};

export const COMPONENTS: Record<string, ComponentEntry> = {
  ContactCard: {
    name: "ContactCard",
    title: "Contact",
    description: "A single contact with activity and quick actions.",
    tools: ["get_contact", "create_contact", "update_contact"],
    render: (data) => {
      const d = asRecord(data);
      // Accept { contact }, { contacts: [...] } or a bare contact detail.
      const contact = (d.contact ??
        (Array.isArray(d.contacts) ? d.contacts[0] : undefined) ??
        d) as ContactDetail;
      return <ContactCard contact={contact} />;
    },
    skeleton: <ContactCardSkeleton />,
    mock: { contact: mockContact },
  },

  ContactListCard: {
    name: "ContactListCard",
    title: "Contacts",
    description: "A paginated list of contacts with quick actions.",
    tools: ["search_contacts"],
    render: (data) => (
      <ContactListCard data={data as SearchContactsResult} />
    ),
    skeleton: <ListCardSkeleton />,
    mock: mockContactList,
  },

  LeadSearchResults: {
    name: "LeadSearchResults",
    title: "Lead search results",
    description: "Prospecting candidates with reveal/import actions.",
    tools: ["search_leads", "reveal_lead", "import_leads_as_contacts"],
    render: (data) => <LeadSearchResults data={data as SearchLeadsResult} />,
    skeleton: <ListCardSkeleton />,
    mock: mockLeadSearch,
  },

  CallSessionCard: {
    name: "CallSessionCard",
    title: "Call session",
    description: "Magic-link dialing queue with progress and revoke.",
    tools: ["create_call_session", "get_call_session", "update_call_session"],
    render: (data) => {
      const d = asRecord(data);
      const session: CallSessionInfo = {
        callSessionId: String(d.callSessionId ?? ""),
        title: (d.title as string | null) ?? null,
        userId: String(d.userId ?? ""),
        organizationId: (d.organizationId as string | null) ?? null,
        campaignId: (d.campaignId as string | null) ?? null,
        status: String(d.status ?? "active"),
        expiresAt: (d.expiresAt as string | null) ?? null,
        contactsCount: Number(d.contactsCount ?? 0),
        callsCompleted: Number(d.callsCompleted ?? 0),
        joinUrlAvailable: Boolean(d.joinUrlAvailable ?? d.joinUrl),
      };
      return <CallSessionCard session={session} joinUrl={d.joinUrl as string} />;
    },
    skeleton: <GenericCardSkeleton />,
    mock: { ...mockSession, joinUrl: mockSessionJoinUrl },
  },

  CallbackCard: {
    name: "CallbackCard",
    title: "Callback",
    description: "A scheduled call-back reminder.",
    tools: ["create_callback"],
    render: (data) => <CallbackCard callback={data as CreateCallbackResult} />,
    skeleton: <GenericCardSkeleton />,
    mock: mockCallback,
  },

  MeetingCard: {
    name: "MeetingCard",
    title: "Meeting",
    description: "A booked meeting, calendar-synced when available.",
    tools: ["schedule_meeting"],
    render: (data) => <MeetingCard meeting={data as ScheduleMeetingResult} />,
    skeleton: <GenericCardSkeleton />,
    mock: mockMeeting,
  },

  CallOutcomeCard: {
    name: "CallOutcomeCard",
    title: "Call outcome",
    description: "A logged call disposition with the next best step.",
    tools: ["log_call_outcome"],
    render: (data) => <CallOutcomeCard outcome={data as LogCallOutcomeResult} />,
    skeleton: <GenericCardSkeleton />,
    mock: mockOutcome,
  },
};

export const COMPONENT_LIST = Object.values(COMPONENTS);
