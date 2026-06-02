import type {
  CallSessionInfo,
  ContactDetail,
  CreateCallbackResult,
  LogCallOutcomeResult,
  ScheduleMeetingResult,
  SearchLeadsResult,
} from "@ringee-io/agent";

/**
 * Sample data so every component renders standalone in the gallery and as a
 * fallback when not embedded in ChatGPT. Shapes match the MCP tool outputs.
 */

export const mockContact: ContactDetail = {
  id: "c1a2b3c4-d5e6-7890-abcd-ef1234567890",
  name: "Jordan Rivera",
  firstName: "Jordan",
  lastName: "Rivera",
  phoneNumber: "+14155552671",
  email: "jordan.rivera@northwind.io",
  company: "Northwind Labs",
  jobTitle: "VP of Sales",
  lastCallAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  tags: [{ name: "Hot lead" }, { name: "Enterprise" }],
  calls: [
    { outcome: "interested", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString() },
    { outcome: "voicemail", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() },
  ],
};

export const mockLeadSearch: SearchLeadsResult = {
  ok: true,
  jobId: "9f8e7d6c-5b4a-3210-9876-543210fedcba",
  provider: "apollo",
  cached: false,
  page: 1,
  perPage: 25,
  total: 184,
  hasMore: true,
  results: [
    {
      externalId: "apollo_55012",
      confidence: 0.94,
      person: {
        fullName: "Priya Nair",
        jobTitle: "Head of Revenue",
        seniority: "vp",
        department: "sales",
        linkedinUrl: "https://linkedin.com/in/priyanair",
        location: "San Francisco, CA",
        emailsAvailable: true,
        phonesAvailable: true,
      },
      company: {
        name: "Lumen AI",
        domain: "lumen.ai",
        industry: "Artificial Intelligence",
        employeeCount: 240,
      },
    },
    {
      externalId: "apollo_55013",
      confidence: 0.81,
      person: {
        fullName: "Marcus Webb",
        jobTitle: "Director of Sales",
        seniority: "director",
        department: "sales",
        linkedinUrl: null,
        location: "Austin, TX",
        emailsAvailable: true,
        phonesAvailable: false,
      },
      company: {
        name: "Cedar Systems",
        domain: "cedarsys.com",
        industry: "B2B Software",
        employeeCount: 90,
      },
    },
    {
      externalId: "apollo_55014",
      confidence: 0.62,
      person: {
        fullName: "Hana Kim",
        jobTitle: "VP Sales, EMEA",
        seniority: "vp",
        department: "sales",
        linkedinUrl: "https://linkedin.com/in/hanakim",
        location: "London, UK",
        emailsAvailable: false,
        phonesAvailable: false,
      },
      company: {
        name: "Brightpath",
        domain: "brightpath.co",
        industry: "SaaS",
        employeeCount: 520,
      },
    },
  ],
};

export const mockSession: CallSessionInfo = {
  callSessionId: "s1234567-89ab-cdef-0123-456789abcdef",
  title: "Tuesday outbound — enterprise",
  userId: "u-1",
  organizationId: "org-1",
  campaignId: "camp-q2-expansion",
  status: "active",
  expiresAt: new Date(Date.now() + 1000 * 60 * 55).toISOString(),
  contactsCount: 24,
  callsCompleted: 9,
  joinUrlAvailable: true,
};

export const mockSessionJoinUrl =
  "https://app.ringee.io/dialer/session?token=ndk38fhskd92ksl";

export const mockCallback: CreateCallbackResult = {
  ok: true,
  callbackId: "cb-7781",
  scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(),
  status: "scheduled",
};

export const mockMeeting: ScheduleMeetingResult = {
  ok: true,
  meetingId: "mt-3391",
  scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
  duration: 30,
  status: "confirmed",
};

export const mockOutcome: LogCallOutcomeResult = {
  ok: true,
  callId: "call-90021",
  outcome: "meeting_booked",
  outcomeNote: "Booked a 30-min demo for Thursday. Send the deck beforehand.",
};
