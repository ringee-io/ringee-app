import type {
  CallSessionInfo,
  ContactDetail,
  CreateCallbackResult,
  LogCallOutcomeResult,
  ScheduleMeetingResult,
  SearchContactsResult,
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
    {
      outcome: "interested",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    },
    {
      outcome: "voicemail",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    },
  ],
};

export const mockContactList: SearchContactsResult = {
  total: 42,
  page: 1,
  totalPages: 6,
  limit: 8,
  query: "*",
  contacts: [
    {
      id: "c1",
      name: "Jordan Rivera",
      firstName: "Jordan",
      lastName: "Rivera",
      phoneNumber: "+14155552671",
      email: "jordan.rivera@northwind.io",
      company: "Northwind Labs",
      jobTitle: "VP of Sales",
      lastCallAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    },
    {
      id: "c2",
      name: "Priya Nair",
      firstName: "Priya",
      lastName: "Nair",
      phoneNumber: "+14155558820",
      email: "priya@lumen.ai",
      company: "Lumen AI",
      jobTitle: "Head of Revenue",
      lastCallAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
      id: "c3",
      name: "Marcus Webb",
      firstName: "Marcus",
      lastName: "Webb",
      phoneNumber: "+13125550144",
      email: "marcus.webb@cedarsys.com",
      company: "Cedar Systems",
      jobTitle: "Director of Sales",
      lastCallAt: null,
    },
    {
      id: "c4",
      name: "Hana Kim",
      firstName: "Hana",
      lastName: "Kim",
      phoneNumber: "+447700900123",
      email: "hana.kim@brightpath.co",
      company: "Brightpath",
      jobTitle: "VP Sales, EMEA",
      lastCallAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    },
    {
      id: "c5",
      name: "Diego Santos",
      firstName: "Diego",
      lastName: "Santos",
      phoneNumber: "+5511955551234",
      email: "diego@vento.com.br",
      company: "Vento",
      jobTitle: "Founder",
      lastCallAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
      id: "c6",
      name: "Amelia Fox",
      firstName: "Amelia",
      lastName: "Fox",
      phoneNumber: "+14155553077",
      email: "amelia.fox@quanta.io",
      company: "Quanta",
      jobTitle: "RevOps Lead",
      lastCallAt: null,
    },
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
