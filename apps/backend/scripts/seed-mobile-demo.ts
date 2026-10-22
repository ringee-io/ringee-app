/**
 * Fills a workspace of a LOCAL database with the demo data of the mobile app
 * design (Bitácora delivery "Ringee"): the contacts, lists, campaigns, inbox
 * conversations, calls and today's agenda its screens were drawn with, so the
 * app can be looked at the way the design shows it.
 *
 *   DATABASE_URL=postgresql://…@localhost:5432/… \
 *     pnpm --filter backend run seed:mobile-demo -- --email you@example.com --org "Your org"
 *
 *   --email <email>    The person who signs in to the app (required).
 *   --org <org>        The organization workspace, by name, Clerk id or id. Without it the
 *                      data goes to the person's personal workspace (no campaigns there).
 *   --reset            Remove what the seed created and stop.
 *   --allow-remote     Run against a database that is not on this machine.
 *
 * Every row gets an id derived from the workspace and its role in the demo, so
 * a second run replaces the first one instead of adding to it — and times are
 * relative to the moment it runs: run it again on another day and "Today"
 * still has a callback overdue, two missed calls and a meeting this afternoon.
 *
 * The rows are written straight to the database, on purpose: going through the
 * services would push them to CRMs, webhooks and automations. Phone numbers are
 * in the fictional 555-01XX range — calling one from the app places a real
 * call that fails.
 */
import "reflect-metadata";
import { createHash } from "node:crypto";

import {
  AgentSessionStatus,
  AiPipelineContextType,
  CallAttemptStatus,
  CallOutcome,
  CallStatus,
  CallbackStatus,
  CampaignLeadStatus,
  DialerMode,
  InboxEventDirection,
  InboxEventKind,
  InboxEventStatus,
  InboxThreadStatus,
  MeetingStatus,
  MessageDirection,
  MessageStatus,
  PendingActionPriority,
  PendingActionSource,
  PendingActionStatus,
  PendingActionType,
  Prisma,
  PrismaClient,
  TranscriptionSource,
  TranscriptionStatus,
} from "@ringee/database";

const SOURCE = "mobile-demo-seed";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/* ─── Arguments and safety ─────────────────────────────────────────────── */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];
  if (!local.includes(host) && !flag("allow-remote")) {
    throw new Error(
      `Refusing to seed demo data into "${host}". This seed is for a local ` +
        "database; pass --allow-remote if you really mean it.",
    );
  }
}

/* ─── Deterministic ids and randomness ─────────────────────────────────── */

/** A UUID (v5 layout) derived from the workspace and the row's role. */
function idFor(scope: string, key: string): string {
  const hash = createHash("sha1").update(`${SOURCE}|${scope}|${key}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Mulberry32: the same filler contacts on every run. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─── The design's data (design/data.json), in English ─────────────────── */

interface DemoContact {
  key: string;
  first: string;
  last: string;
  company: string;
  phone: string;
  jobTitle?: string;
  industry?: string;
  employees?: number;
  revenue?: string;
  summary?: string;
  lastNote?: string;
}

const PEOPLE: DemoContact[] = [
  {
    key: "c1",
    first: "Laura",
    last: "Méndez",
    company: "Grupo Costa Azul",
    phone: "+18095550142",
    jobTitle: "Director of Operations",
    industry: "Hospitality",
    employees: 180,
    revenue: "US$24M",
    summary:
      "12 years in hotel operations. Decides with Finance on the insurance for the fleet and the staff.",
    lastNote: "Wants to compare with another insurer before renewing.",
  },
  {
    key: "c2",
    first: "Martín",
    last: "Ortega",
    company: "Ferretería Ortega",
    phone: "+18295550187",
    jobTitle: "Owner and general manager",
    industry: "Hardware retail",
    employees: 35,
    revenue: "US$3.5M",
    summary:
      "Founded the hardware store in 2009 and runs three locations. Decides on his own; prefers short calls with numbers.",
    lastNote:
      "Asked for a quote to insure the store before the end of the year.",
  },
  {
    key: "c3",
    first: "Sofía",
    last: "Valdez",
    company: "Clínica Valdez",
    phone: "+18495550119",
    jobTitle: "Medical director",
    industry: "Private healthcare",
    employees: 60,
    revenue: "US$8M",
    summary:
      "Cardiologist; has run the clinic since 2018. Wants liability coverage for the medical team.",
    lastNote: "Prefers to be called before noon.",
  },
  {
    key: "c4",
    first: "Diego",
    last: "Herrera",
    company: "Transportes Herrera",
    phone: "+18095550163",
    jobTitle: "Fleet manager",
    industry: "Transportation",
    lastNote: "Has 12 trucks; asked for a price to insure the whole fleet.",
  },
  {
    key: "c5",
    first: "Paola",
    last: "Núñez",
    company: "Estudio Núñez",
    phone: "+18295550124",
    jobTitle: "Founding architect",
    industry: "Architecture",
    lastNote:
      "Interested in the plan for her studio; waiting for the proposal by email.",
  },
  {
    key: "c6",
    first: "Ricardo",
    last: "Peña",
    company: "Panadería La Espiga",
    phone: "+18095550178",
    jobTitle: "Owner",
    industry: "Food and beverage",
    lastNote: "Asked about fire insurance for the bakery.",
  },
  {
    key: "c7",
    first: "Gabriela",
    last: "Rosario",
    company: "Inmobiliaria Rosario",
    phone: "+18495550131",
    jobTitle: "Managing partner",
    industry: "Real estate",
  },
  {
    key: "c8",
    first: "Tomás",
    last: "Jiménez",
    company: "Taller Jiménez",
    phone: "+18295550156",
    jobTitle: "Owner",
    industry: "Automotive repair",
  },
];

interface DemoList {
  key: string;
  name: string;
  description: string;
  people: string[];
  fillers: number;
  /** Company names the filler contacts of this list work at. */
  trades: string[];
  titles: string[];
}

const LISTS: DemoList[] = [
  {
    key: "renewal",
    name: "Q4 renewal clients",
    description: "Used in Q4 Renewals",
    people: ["c1", "c2", "c3", "c5", "c7", "c8"],
    fillers: 34,
    trades: [
      "Hotel",
      "Restaurante",
      "Farmacia",
      "Constructora",
      "Agencia de Viajes",
      "Colegio",
      "Supermercado",
    ],
    titles: ["Owner", "General manager", "Finance director", "Administrator"],
  },
  {
    key: "fleets",
    name: "Transport fleets",
    description: "Used in Fleet Insurance 2027",
    people: ["c4"],
    fillers: 55,
    trades: [
      "Transportes",
      "Logística",
      "Mudanzas",
      "Distribuidora",
      "Courier",
    ],
    titles: ["Fleet manager", "Operations manager", "Owner", "Logistics lead"],
  },
  {
    key: "health",
    name: "Private healthcare",
    description: "Used in SMB Health",
    people: ["c3"],
    fillers: 22,
    trades: [
      "Centro Médico",
      "Clínica Dental",
      "Consultorio",
      "Centro de Fisioterapia",
      "Óptica",
    ],
    titles: ["Medical director", "Clinic administrator", "Owner"],
  },
  {
    key: "smb",
    name: "Santo Domingo SMBs",
    description: "No active campaign",
    people: ["c6", "c2", "c5"],
    fillers: 125,
    trades: [
      "Ferretería",
      "Colmado",
      "Salón de Belleza",
      "Repuestos",
      "Panadería",
      "Imprenta",
      "Papelería",
      "Taller",
    ],
    titles: ["Owner", "Manager", "Administrator", "Partner"],
  },
];

const FIRST_NAMES = [
  "Ana",
  "José",
  "María",
  "Luis",
  "Carmen",
  "Juan",
  "Rosa",
  "Pedro",
  "Elena",
  "Miguel",
  "Patricia",
  "Rafael",
  "Yolanda",
  "Héctor",
  "Lucía",
  "Fernando",
  "Isabel",
  "Manuel",
  "Teresa",
  "Andrés",
  "Claudia",
  "Ramón",
  "Daniela",
  "Víctor",
  "Mónica",
  "Alberto",
  "Natalia",
  "Francisco",
  "Julia",
  "Eduardo",
  "Beatriz",
  "Óscar",
  "Adriana",
  "Jorge",
  "Verónica",
  "Wilson",
  "Yesenia",
  "Franklin",
  "Altagracia",
  "Ramona",
  "Julio",
  "Esther",
];
const LAST_NAMES = [
  "Rodríguez",
  "Martínez",
  "Pérez",
  "García",
  "Santos",
  "Reyes",
  "Díaz",
  "Castillo",
  "Guzmán",
  "Batista",
  "Polanco",
  "Mejía",
  "Vargas",
  "Cabrera",
  "Taveras",
  "Almonte",
  "Espinal",
  "Féliz",
  "Tejada",
  "Ureña",
  "Sánchez",
  "Ramírez",
  "Peralta",
  "Medina",
  "Fernández",
  "Paulino",
  "Encarnación",
  "Báez",
  "Mateo",
  "Lantigua",
];

/* ─── Times, relative to the moment the seed runs ──────────────────────── */

const now = new Date();
const startOfToday = new Date(now);
startOfToday.setHours(0, 0, 0, 0);
const endOfToday = new Date(startOfToday.getTime() + DAY - 1);

/** Rounded to five minutes, so the app shows tidy times. */
function tidy(ms: number) {
  return new Date(Math.round(ms / (5 * MINUTE)) * 5 * MINUTE);
}
/** Earlier today, `minutes` before now — never before midnight. */
function earlier(minutes: number) {
  return tidy(
    Math.max(
      startOfToday.getTime() + 5 * MINUTE,
      now.getTime() - minutes * MINUTE,
    ),
  );
}
/** Later today: a share of what is left of the day, at most six hours away. */
function later(share: number) {
  const room = Math.min(
    endOfToday.getTime() - 15 * MINUTE - now.getTime(),
    6 * HOUR,
  );
  return tidy(now.getTime() + Math.max(room, 10 * MINUTE) * share);
}
/** `days` ago at a local clock time. */
function daysAgo(days: number, hour: number, minute = 0) {
  const d = new Date(startOfToday.getTime() - days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function tomorrowAt(hour: number, minute = 0) {
  return daysAgo(-1, hour, minute);
}

/* ─── The seed ─────────────────────────────────────────────────────────── */

const prisma = new PrismaClient();

async function main() {
  assertLocalDatabase();

  const email = arg("email");
  if (!email)
    throw new Error("Pass --email with the address the person signs in with.");

  const userEmail = await prisma.userEmail.findUnique({
    where: { email },
    include: { user: true },
  });
  if (!userEmail) throw new Error(`No user has the email ${email}.`);
  const me = userEmail.user;

  const orgArg = arg("org");
  let organizationId: string | null = null;
  let orgName: string | null = null;
  if (orgArg) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(orgArg);
    const org = await prisma.organization.findFirst({
      where: {
        OR: [
          ...(isUuid ? [{ id: orgArg }] : []),
          { clerkId: orgArg },
          { name: { equals: orgArg, mode: "insensitive" } },
        ],
      },
    });
    if (!org) throw new Error(`No organization matches "${orgArg}".`);
    organizationId = org.id;
    orgName = org.name;
    const member = await prisma.organizationMembership.findFirst({
      where: { organizationId: org.id, userId: me.id },
    });
    if (!member) {
      console.warn(
        `Note: ${email} is not a member of ${org.name} in this database.`,
      );
    }
  }

  const scope = organizationId
    ? `org:${organizationId}:${me.id}`
    : `user:${me.id}`;
  const id = (key: string) => idFor(scope, key);
  const workspace = { userId: me.id, organizationId };
  const label = orgName ? `the ${orgName} workspace` : "the personal workspace";

  const plan = buildPlan(id);
  await removeSeed(plan, id);
  if (flag("reset")) {
    console.log(`Removed the demo data from ${label}.`);
    return;
  }

  const line =
    (
      await prisma.numberPurchased.findFirst({
        where: organizationId
          ? { organizationId, deletedAt: null, active: true }
          : {
              userId: me.id,
              organizationId: null,
              deletedAt: null,
              active: true,
            },
        orderBy: { createdAt: "asc" },
      })
    )?.phoneNumber ?? "+18095550100";

  /* Teammate ─────────────────────────────────────────────────────────── */
  // Only in the database: the app lists the team from Clerk, so their
  // conversations read "Assigned" there and their name in the web app.
  let teammateId: string | null = null;
  if (organizationId) {
    teammateId = id("user:carlos");
    await prisma.user.create({
      data: {
        id: teammateId,
        firstName: "Carlos",
        lastName: "Ruiz",
        phoneRequired: false,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        id: id("membership:carlos"),
        organizationId,
        userId: teammateId,
        role: "org:member",
      },
    });
  }

  /* Companies and contacts ────────────────────────────────────────────── */
  const contactsData: Prisma.ContactCreateManyInput[] = [];
  const companiesData: Prisma.CompanyCreateManyInput[] = [];
  const affiliationsData: Prisma.ContactAffiliationCreateManyInput[] = [];

  plan.fillers.forEach((f, i) => {
    contactsData.push({
      id: f.id,
      ...workspace,
      name: `${f.first} ${f.last}`,
      firstName: f.first,
      lastName: f.last,
      phoneNumber: f.phone,
      company: f.company,
      jobTitle: f.title,
      source: SOURCE,
      locationCity: "Santo Domingo",
      locationCountry: "Dominican Republic",
      locationCountryCode: "DO",
      timezone: "America/Santo_Domingo",
      createdAt: new Date(now.getTime() - 40 * DAY),
      // Contacts list newest-updated first: the design's people stay on top.
      updatedAt: new Date(now.getTime() - (i + 10) * MINUTE),
    });
  });

  PEOPLE.forEach((p, i) => {
    const contactId = id(`contact:${p.key}`);
    contactsData.push({
      id: contactId,
      ...workspace,
      name: `${p.first} ${p.last}`,
      firstName: p.first,
      lastName: p.last,
      phoneNumber: p.phone,
      company: p.company,
      jobTitle: p.jobTitle ?? null,
      summary: p.summary ?? null,
      source: SOURCE,
      locationCity: "Santo Domingo",
      locationCountry: "Dominican Republic",
      locationCountryCode: "DO",
      timezone: "America/Santo_Domingo",
      createdAt: new Date(now.getTime() - 60 * DAY),
      updatedAt: new Date(now.getTime() - i * 1000),
    });
    const companyId = id(`company:${p.key}`);
    companiesData.push({
      id: companyId,
      ...workspace,
      // No normalizedName: it is unique per workspace, and a real company of
      // the same name must not collide with the demo's.
      name: p.company,
      industry: p.industry ?? null,
      employeeCount: p.employees ?? null,
      revenueRange: p.revenue ?? null,
      hqCity: "Santo Domingo",
      hqCountry: "Dominican Republic",
      hqCountryCode: "DO",
      source: SOURCE,
    });
    affiliationsData.push({
      id: id(`affiliation:${p.key}`),
      contactId,
      companyId,
      role: p.jobTitle ?? null,
      isPrimary: true,
    });
  });

  await prisma.contact.createMany({ data: contactsData });
  await prisma.company.createMany({ data: companiesData });
  await prisma.contactAffiliation.createMany({ data: affiliationsData });

  const person = (key: string) => {
    const p = PEOPLE.find((x) => x.key === key)!;
    return { ...p, id: id(`contact:${key}`), name: `${p.first} ${p.last}` };
  };

  /* Lists ─────────────────────────────────────────────────────────────── */
  for (const list of LISTS) {
    const listId = id(`list:${list.key}`);
    await prisma.contactList.create({
      data: {
        id: listId,
        ...workspace,
        name: list.name,
        description: list.description,
        assignedToId: me.id,
        createdAt: new Date(now.getTime() - 30 * DAY),
      },
    });
    const members = [
      ...list.people.map((key) => id(`contact:${key}`)),
      ...plan.fillers.filter((f) => f.list === list.key).map((f) => f.id),
    ];
    await prisma.contactListEntry.createMany({
      data: members.map((contactId, i) => ({
        id: id(`entry:${list.key}:${contactId}`),
        listId,
        contactId,
        source: "manual",
        addedById: me.id,
        createdAt: new Date(now.getTime() - 30 * DAY + i * 1000),
        calledAt: plan.calledToday.has(contactId) ? earlier(30) : null,
      })),
    });
  }

  /* Calls ─────────────────────────────────────────────────────────────── */
  interface CallSpec {
    key: string;
    contactId: string;
    phone: string;
    by?: string | null;
    direction: "inbound" | "outbound";
    at: Date;
    /** Talk time; 0 for a call nobody answered. */
    seconds: number;
    outcome?: CallOutcome | null;
    note?: string | null;
    recorded?: boolean;
  }

  const calls: CallSpec[] = [];
  const c = (key: string) => person(key);

  // The history behind each of the design's people.
  calls.push(
    {
      key: "call:c1:y",
      contactId: c("c1").id,
      phone: c("c1").phone,
      direction: "outbound",
      at: daysAgo(1, 16, 20),
      seconds: 252,
      outcome: CallOutcome.interested,
      note: "Interested in the annual plan. Wants the proposal by email and to talk again.",
      recorded: true,
    },
    {
      key: "call:c1:6d",
      contactId: c("c1").id,
      phone: c("c1").phone,
      direction: "outbound",
      at: daysAgo(6, 11, 5),
      seconds: 0,
      outcome: CallOutcome.no_answer,
    },
    {
      key: "call:c1:8d",
      contactId: c("c1").id,
      phone: c("c1").phone,
      direction: "outbound",
      at: daysAgo(8, 10, 40),
      seconds: 150,
      outcome: CallOutcome.follow_up,
      note: "Renewal is in December; call back closer to the date.",
      recorded: true,
    },
    {
      key: "call:c2:2d",
      contactId: c("c2").id,
      phone: c("c2").phone,
      direction: "outbound",
      at: daysAgo(2, 15, 10),
      seconds: 220,
      outcome: CallOutcome.follow_up,
      note: "Asked for a quote to insure the store before the end of the year.",
      recorded: true,
    },
    {
      key: "call:c3:4d",
      contactId: c("c3").id,
      phone: c("c3").phone,
      direction: "outbound",
      at: daysAgo(4, 11, 30),
      seconds: 310,
      outcome: CallOutcome.interested,
      note: "Wants liability coverage for nine doctors.",
      recorded: true,
    },
    {
      key: "call:c3:vm",
      contactId: c("c3").id,
      phone: c("c3").phone,
      direction: "inbound",
      at: earlier(150),
      seconds: 0,
      recorded: true,
    },
    {
      key: "call:c4:3d",
      contactId: c("c4").id,
      phone: c("c4").phone,
      direction: "outbound",
      at: daysAgo(3, 9, 45),
      seconds: 125,
      outcome: CallOutcome.interested,
      note: "Has 12 trucks; asked for a price to insure the whole fleet.",
      recorded: true,
    },
    {
      key: "call:c4:missed",
      contactId: c("c4").id,
      phone: c("c4").phone,
      direction: "inbound",
      at: earlier(55),
      seconds: 0,
    },
    {
      key: "call:c5:y",
      contactId: c("c5").id,
      phone: c("c5").phone,
      by: teammateId,
      direction: "outbound",
      at: daysAgo(1, 12, 35),
      seconds: 185,
      outcome: CallOutcome.interested,
      note: "Interested in the plan for her studio; waiting for the proposal by email.",
      recorded: true,
    },
    {
      key: "call:c6:5d",
      contactId: c("c6").id,
      phone: c("c6").phone,
      direction: "outbound",
      at: daysAgo(5, 14, 0),
      seconds: 110,
      outcome: CallOutcome.interested,
      note: "Asked about fire insurance for the bakery.",
    },
    {
      key: "call:c6:missed",
      contactId: c("c6").id,
      phone: c("c6").phone,
      direction: "inbound",
      at: earlier(120),
      seconds: 0,
    },
    {
      key: "call:c7:2d",
      contactId: c("c7").id,
      phone: c("c7").phone,
      by: teammateId,
      direction: "outbound",
      at: daysAgo(2, 10, 15),
      seconds: 270,
      outcome: CallOutcome.sale,
      note: "Signing the policy for the three offices.",
      recorded: true,
    },
    {
      key: "call:c8:2d",
      contactId: c("c8").id,
      phone: c("c8").phone,
      direction: "outbound",
      at: daysAgo(2, 16, 50),
      seconds: 400,
      outcome: CallOutcome.sale,
      note: "Bought the workshop policy, paid yearly.",
      recorded: true,
    },
  );

  // Today's work: 12 calls, 7 conversations, 48 minutes — the design's day.
  const todayCalls: {
    filler: (typeof plan.fillers)[number];
    seconds: number;
    outcome: CallOutcome;
    note?: string;
    campaign: boolean;
  }[] = [
    {
      filler: plan.renewalCalled[0]!,
      seconds: 372,
      outcome: CallOutcome.interested,
      note: "Asked for the coverage comparison by email.",
      campaign: true,
    },
    {
      filler: plan.renewalCalled[1]!,
      seconds: 0,
      outcome: CallOutcome.no_answer,
      campaign: true,
    },
    {
      filler: plan.renewalCalled[2]!,
      seconds: 280,
      outcome: CallOutcome.follow_up,
      note: "Wants to review it with her partner first.",
      campaign: true,
    },
    {
      filler: plan.renewalCalled[3]!,
      seconds: 0,
      outcome: CallOutcome.voicemail,
      campaign: true,
    },
    {
      filler: plan.renewalCalled[4]!,
      seconds: 570,
      outcome: CallOutcome.meeting_booked,
      note: "Review with Finance tomorrow at 11.",
      campaign: true,
    },
    {
      filler: plan.renewalCalled[5]!,
      seconds: 200,
      outcome: CallOutcome.not_interested,
      note: "Renewed with another insurer last month.",
      campaign: true,
    },
    {
      filler: plan.renewalCalled[6]!,
      seconds: 0,
      outcome: CallOutcome.no_answer,
      campaign: true,
    },
    {
      filler: plan.renewalCalled[7]!,
      seconds: 358,
      outcome: CallOutcome.callback_scheduled,
      note: "Call back tomorrow after 3 pm.",
      campaign: true,
    },
    {
      filler: plan.smbCalled[0]!,
      seconds: 600,
      outcome: CallOutcome.interested,
      note: "Wants the price for two locations.",
      campaign: false,
    },
    {
      filler: plan.smbCalled[1]!,
      seconds: 0,
      outcome: CallOutcome.no_answer,
      campaign: false,
    },
    {
      filler: plan.smbCalled[2]!,
      seconds: 500,
      outcome: CallOutcome.sale,
      note: "Closed the fire policy for the store.",
      campaign: false,
    },
    {
      filler: plan.smbCalled[3]!,
      seconds: 0,
      outcome: CallOutcome.no_answer,
      campaign: false,
    },
  ];
  // Spread from mid-morning (or the start of the day) to a few minutes ago.
  const dayFrom = Math.max(
    now.getTime() - 3 * HOUR,
    startOfToday.getTime() + 2 * MINUTE,
  );
  const dayTo = Math.max(dayFrom + MINUTE, now.getTime() - 25 * MINUTE);
  todayCalls.forEach((t, i) => {
    calls.push({
      key: `call:today:${i}`,
      contactId: t.filler.id,
      phone: t.filler.phone,
      direction: "outbound",
      at: new Date(dayFrom + ((dayTo - dayFrom) * i) / todayCalls.length),
      seconds: t.seconds,
      outcome: t.outcome,
      note: t.note ?? null,
      recorded: t.seconds > 0,
    });
  });

  const callsData: Prisma.CallCreateManyInput[] = calls.map((call) => {
    const answered = call.seconds > 0;
    const end = new Date(
      call.at.getTime() + (answered ? call.seconds * 1000 + 15_000 : 25_000),
    );
    return {
      id: id(call.key),
      userId: call.by ?? me.id,
      organizationId,
      direction: call.direction,
      fromNumber: call.direction === "outbound" ? line : call.phone,
      toNumber: call.direction === "outbound" ? call.phone : line,
      status: CallStatus.completed,
      durationSeconds: call.seconds,
      startedAt: call.at,
      answeredAt: answered ? new Date(call.at.getTime() + 12_000) : null,
      endedAt: end,
      contactId: call.contactId,
      outcome: call.outcome ?? null,
      outcomeNote: call.note ?? null,
      source: SOURCE,
      createdAt: call.at,
      updatedAt: end,
    };
  });
  await prisma.call.createMany({ data: callsData });

  // Placeholder files: the player shows, but these cannot be played.
  await prisma.recording.createMany({
    data: calls
      .filter((call) => call.recorded)
      .map((call) => ({
        id: id(`recording:${call.key}`),
        callId: id(call.key),
        url: `https://recordings.invalid/${SOURCE}/${id(call.key)}.mp3`,
        status: "completed",
        durationSec: call.seconds || 48,
      })),
  });

  // Last call per contact, for the lists' "Not called" chip.
  const lastCall = new Map<string, Date>();
  for (const call of calls) {
    if (call.direction !== "outbound") continue;
    const prev = lastCall.get(call.contactId);
    if (!prev || prev < call.at) lastCall.set(call.contactId, call.at);
  }
  for (const [contactId, at] of lastCall) {
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastCallAt: at },
    });
  }

  // The transcript of Laura's last call.
  const lauraCall = id("call:c1:y");
  const transcriptLines: [boolean, string][] = [
    [
      true,
      "Hi Laura, I'm calling about your policy renewal. Is now a good time?",
    ],
    [false, "Yes, go ahead. I was going to call you this week."],
    [
      true,
      "Your fleet and staff policies expire in December. Has anything changed this year?",
    ],
    [
      false,
      "We added two vans, and Finance wants to compare with another insurer before we renew.",
    ],
    [
      true,
      "That makes sense. The annual plan covers the new vans and keeps this year's rate.",
    ],
    [false, "Send me the proposal by email and let's talk again tomorrow."],
    [true, "Perfect, I'll send it today and call you tomorrow at ten."],
  ];
  await prisma.callTranscription.create({
    data: {
      id: id("transcription:c1:y"),
      callId: lauraCall,
      ...workspace,
      source: TranscriptionSource.recording,
      status: TranscriptionStatus.completed,
      text: transcriptLines.map(([, text]) => text).join(" "),
      language: "en",
      confidence: 0.94,
      startedAt: daysAgo(1, 16, 25),
      completedAt: daysAgo(1, 16, 26),
      durationMs: 252_000,
    },
  });
  await prisma.callTranscriptionSegment.createMany({
    data: transcriptLines.map(([mine, text], i) => ({
      id: id(`segment:c1:y:${i}`),
      callId: lauraCall,
      transcriptionId: id("transcription:c1:y"),
      text,
      speaker: mine ? 0 : 1,
      track: mine ? "outbound" : "inbound",
      confidence: 0.94,
      startMs: i * 34_000,
      endMs: i * 34_000 + 30_000,
      isFinal: true,
    })),
  });

  /* Notes ─────────────────────────────────────────────────────────────── */
  // The last note sits just after each person's last call, so it is the one
  // Today, the lists and the contact page show.
  const noteAt: Record<string, Date> = {
    c1: earlier(25),
    c2: daysAgo(2, 15, 20),
    c3: daysAgo(4, 11, 40),
    c4: daysAgo(3, 9, 50),
    c5: daysAgo(1, 12, 45),
    c6: daysAgo(5, 14, 5),
  };
  await prisma.contactNote.createMany({
    data: [
      ...PEOPLE.filter((p) => p.lastNote).map((p) => ({
        id: id(`note:${p.key}`),
        contactId: id(`contact:${p.key}`),
        userId: me.id,
        content: p.lastNote!,
        createdAt: noteAt[p.key]!,
        updatedAt: noteAt[p.key]!,
      })),
      {
        id: id("note:c1:old"),
        contactId: id("contact:c1"),
        userId: me.id,
        content: "Decides together with the finance director.",
        createdAt: daysAgo(8, 10, 50),
        updatedAt: daysAgo(8, 10, 50),
      },
    ],
  });

  /* Today: callbacks, a follow-up and meetings ─────────────────────────── */
  await prisma.callbackTask.createMany({
    data: [
      {
        id: id("callback:c1"),
        ...workspace,
        contactId: c("c1").id,
        callId: lauraCall,
        scheduledAt: earlier(40),
        note: "Send the proposal before the call.",
        status: CallbackStatus.scheduled,
        createdAt: daysAgo(1, 16, 30),
      },
      {
        id: id("callback:c2"),
        ...workspace,
        contactId: c("c2").id,
        callId: id("call:c2:2d"),
        scheduledAt: later(0.3),
        note: "Walk him through the store quote.",
        status: CallbackStatus.scheduled,
        createdAt: daysAgo(2, 15, 20),
      },
      {
        id: id("callback:c3"),
        ...workspace,
        contactId: c("c3").id,
        callId: id("call:c3:4d"),
        scheduledAt: later(0.9),
        note: "Confirm how many doctors to cover.",
        status: CallbackStatus.scheduled,
        createdAt: daysAgo(4, 11, 40),
      },
    ],
  });

  await prisma.pendingAction.create({
    data: {
      id: id("action:c5"),
      type: PendingActionType.create_callback,
      status: PendingActionStatus.pending,
      priority: PendingActionPriority.high,
      source: PendingActionSource.rule,
      title: "Call Paola to go over the proposal",
      reason:
        "She asked for the proposal by email and is expecting a call to review it.",
      dueAt: later(0.4),
      contextType: organizationId
        ? AiPipelineContextType.organization_outside_campaign
        : AiPipelineContextType.personal,
      contextKey: `${SOURCE}:${scope}`,
      ...workspace,
      contactId: c("c5").id,
      callId: id("call:c5:y"),
      createdAt: daysAgo(1, 12, 50),
    },
  });

  await prisma.meeting.createMany({
    data: [
      {
        id: id("meeting:c1"),
        ...workspace,
        contactId: c("c1").id,
        callId: lauraCall,
        title: "Meeting with Laura",
        scheduledAt: later(0.75),
        duration: 30,
        location: "https://meet.google.com/rgn-demo-lmz",
        notes: "Walk through the annual plan with Finance.",
        status: MeetingStatus.scheduled,
        createdAt: daysAgo(1, 16, 30),
      },
      {
        id: id("meeting:r4"),
        ...workspace,
        contactId: plan.renewalCalled[4]!.id,
        title: `Review with ${plan.renewalCalled[4]!.first}`,
        scheduledAt: tomorrowAt(11),
        duration: 30,
        location: "https://meet.google.com/rgn-demo-fin",
        status: MeetingStatus.scheduled,
        createdAt: earlier(60),
      },
    ],
  });

  /* Inbox ─────────────────────────────────────────────────────────────── */
  interface EventSpec {
    key: string;
    kind: InboxEventKind;
    direction: InboxEventDirection;
    at: Date;
    status?: InboxEventStatus;
    callKey?: string;
    body?: string;
    title?: string;
    durationSec?: number;
    transcript?: string;
    by?: string | null;
    meetingId?: string;
    callbackId?: string;
    metadata?: Prisma.InputJsonValue;
  }
  interface ThreadSpec {
    key: string;
    contact: ReturnType<typeof person>;
    assignedTo: string | null;
    status: InboxThreadStatus;
    unread: number;
    preview: string;
    events: EventSpec[];
  }
  const sms = (
    key: string,
    out: boolean,
    at: Date,
    body: string,
    by?: string | null,
  ): EventSpec => ({
    key,
    kind: out ? InboxEventKind.sms_sent : InboxEventKind.sms_received,
    direction: out ? InboxEventDirection.outbound : InboxEventDirection.inbound,
    status: out ? InboxEventStatus.delivered : InboxEventStatus.received,
    at,
    body,
    by: out ? (by ?? me.id) : null,
  });
  const callEvent = (callKey: string, by?: string | null): EventSpec => {
    const call = calls.find((x) => x.key === callKey)!;
    return {
      key: `event:${callKey}`,
      kind: InboxEventKind.call_completed,
      direction:
        call.direction === "outbound"
          ? InboxEventDirection.outbound
          : InboxEventDirection.inbound,
      status: InboxEventStatus.completed,
      at: call.at,
      callKey,
      durationSec: call.seconds,
      by: call.direction === "outbound" ? (by ?? call.by ?? me.id) : null,
    };
  };

  const threads: ThreadSpec[] = [
    {
      key: "c2",
      contact: c("c2"),
      assignedTo: me.id,
      status: InboxThreadStatus.open,
      unread: 1,
      preview: "Can you send me the store quote by email?",
      events: [
        callEvent("call:c2:2d"),
        sms(
          "sms:c2:1",
          true,
          daysAgo(1, 9, 30),
          "Hi Martín, the quote for the store will be ready tomorrow.",
        ),
        sms(
          "sms:c2:2",
          false,
          earlier(80),
          "Can you send me the store quote by email?",
        ),
      ],
    },
    {
      key: "c1",
      contact: c("c1"),
      assignedTo: me.id,
      status: InboxThreadStatus.open,
      unread: 0,
      preview: "Wants to compare with another insurer before renewing.",
      events: [
        callEvent("call:c1:8d"),
        callEvent("call:c1:6d"),
        callEvent("call:c1:y"),
        {
          key: "event:c1:callback",
          kind: InboxEventKind.callback_scheduled,
          direction: InboxEventDirection.system,
          at: daysAgo(1, 16, 30),
          title: "Callback scheduled",
          callbackId: id("callback:c1"),
          metadata: { scheduledAt: earlier(40).toISOString() },
        },
        {
          key: "event:c1:meeting",
          kind: InboxEventKind.meeting_booked,
          direction: InboxEventDirection.system,
          at: daysAgo(1, 16, 31),
          title: "Meeting booked",
          meetingId: id("meeting:c1"),
          metadata: { scheduledAt: later(0.75).toISOString() },
        },
        {
          key: "event:c1:note",
          kind: InboxEventKind.note_added,
          direction: InboxEventDirection.internal,
          at: earlier(25),
          body: "Wants to compare with another insurer before renewing.",
          by: me.id,
        },
      ],
    },
    {
      key: "c4",
      contact: c("c4"),
      assignedTo: null,
      status: InboxThreadStatus.open,
      unread: 1,
      preview: "Missed call",
      events: [
        callEvent("call:c4:3d"),
        {
          key: "event:call:c4:missed",
          kind: InboxEventKind.missed_call,
          direction: InboxEventDirection.inbound,
          status: InboxEventStatus.missed,
          at: earlier(55),
          callKey: "call:c4:missed",
        },
      ],
    },
    {
      key: "c3",
      contact: c("c3"),
      assignedTo: me.id,
      status: InboxThreadStatus.open,
      unread: 1,
      preview:
        "Hi, this is Sofía Valdez from Clínica Valdez. I'd like to go over the liability coverage…",
      events: [
        callEvent("call:c3:4d"),
        {
          key: "event:call:c3:vm",
          kind: InboxEventKind.voicemail_received,
          direction: InboxEventDirection.inbound,
          status: InboxEventStatus.received,
          at: earlier(150),
          callKey: "call:c3:vm",
          durationSec: 48,
          transcript:
            "Hi, this is Sofía Valdez from Clínica Valdez. I'd like to go over the liability coverage for our medical team. Please call me back before noon. Thanks.",
        },
      ],
    },
    {
      key: "c6",
      contact: c("c6"),
      assignedTo: null,
      status: InboxThreadStatus.open,
      unread: 0,
      preview: "Missed call",
      events: [
        callEvent("call:c6:5d"),
        {
          key: "event:call:c6:missed",
          kind: InboxEventKind.missed_call,
          direction: InboxEventDirection.inbound,
          status: InboxEventStatus.missed,
          at: earlier(120),
          callKey: "call:c6:missed",
        },
      ],
    },
    {
      key: "c5",
      contact: c("c5"),
      assignedTo: teammateId,
      status: InboxThreadStatus.open,
      unread: 0,
      preview: "Outbound call · Interested · 3:05",
      events: [callEvent("call:c5:y", teammateId)],
    },
    {
      key: "c7",
      contact: c("c7"),
      assignedTo: teammateId,
      status: InboxThreadStatus.resolved,
      unread: 0,
      preview: "Perfect, I'll send you the signed policy today.",
      events: [
        callEvent("call:c7:2d", teammateId),
        sms(
          "sms:c7:1",
          true,
          daysAgo(2, 10, 30),
          "Gabriela, the policy is ready. I just emailed it for your signature.",
          teammateId ?? me.id,
        ),
        sms(
          "sms:c7:2",
          false,
          daysAgo(2, 11, 2),
          "Perfect, I'll send you the signed policy today.",
        ),
      ],
    },
    {
      key: "c8",
      contact: c("c8"),
      assignedTo: me.id,
      status: InboxThreadStatus.resolved,
      unread: 0,
      preview: "Outbound call · Sale · 6:40",
      events: [callEvent("call:c8:2d")],
    },
  ];

  for (const thread of threads) {
    const threadId = id(`thread:${thread.key}`);
    const ordered = [...thread.events].sort(
      (a, b) => a.at.getTime() - b.at.getTime(),
    );
    const last = ordered[ordered.length - 1]!;
    const inbound = ordered
      .filter((e) => e.direction === InboxEventDirection.inbound)
      .pop();
    const outbound = ordered
      .filter((e) => e.direction === InboxEventDirection.outbound)
      .pop();
    await prisma.inboxThread.create({
      data: {
        id: threadId,
        ...workspace,
        contactId: thread.contact.id,
        participantNumber: thread.contact.phone,
        participantNumberE164: thread.contact.phone,
        ringeeNumber: line,
        assignedToId: thread.assignedTo,
        status: thread.status,
        lastEventAt: last.at,
        lastInboundAt: inbound?.at ?? null,
        lastOutboundAt: outbound?.at ?? null,
        unreadCount: thread.unread,
        lastPreview: thread.preview,
        lastEventKind: last.kind,
        resolvedAt:
          thread.status === InboxThreadStatus.resolved ? last.at : null,
        createdAt: ordered[0]!.at,
      },
    });
    for (const event of ordered) {
      const isSms =
        event.kind === InboxEventKind.sms_sent ||
        event.kind === InboxEventKind.sms_received;
      const messageId = isSms ? id(`message:${event.key}`) : null;
      if (messageId) {
        const out = event.kind === InboxEventKind.sms_sent;
        await prisma.message.create({
          data: {
            id: messageId,
            userId: out ? (event.by ?? me.id) : me.id,
            organizationId,
            contactId: thread.contact.id,
            threadId,
            direction: out
              ? MessageDirection.outbound
              : MessageDirection.inbound,
            status: out ? MessageStatus.delivered : MessageStatus.received,
            fromNumber: out ? line : thread.contact.phone,
            toNumber: out ? thread.contact.phone : line,
            text: event.body ?? null,
            sentAt: out ? event.at : null,
            deliveredAt: out ? event.at : null,
            receivedAt: out ? null : event.at,
            createdAt: event.at,
          },
        });
      }
      const call = event.callKey
        ? calls.find((x) => x.key === event.callKey)
        : undefined;
      await prisma.inboxEvent.create({
        data: {
          id: id(event.key),
          threadId,
          direction: event.direction,
          kind: event.kind,
          status: event.status ?? null,
          callId: event.callKey ? id(event.callKey) : null,
          messageId,
          recordingId: call?.recorded ? id(`recording:${call.key}`) : null,
          callbackTaskId: event.callbackId ?? null,
          meetingId: event.meetingId ?? null,
          title: event.title ?? null,
          body: event.body ?? null,
          fromNumber:
            event.direction === InboxEventDirection.outbound
              ? line
              : thread.contact.phone,
          toNumber:
            event.direction === InboxEventDirection.outbound
              ? thread.contact.phone
              : line,
          durationSec: event.durationSec ?? null,
          transcript: event.transcript ?? null,
          occurredAt: event.at,
          metadata: event.metadata ?? undefined,
          createdByUserId: event.by ?? null,
          createdAt: event.at,
        },
      });
    }
  }

  /* Campaigns (organizations only) ────────────────────────────────────── */
  let campaignCount = 0;
  if (organizationId) {
    const dispositions = await prisma.disposition.findMany({
      where: { organizationId, campaignId: null, isActive: true },
    });
    const dispositionFor = (outcome: CallOutcome) =>
      dispositions.find((d) => d.canonicalOutcome === outcome) ?? null;

    const campaigns = [
      {
        key: "renewal",
        list: "renewal",
        name: "Q4 Renewals",
        description:
          "Clients whose policy expires before December. Review their coverage and pitch the annual plan.",
        mode: DialerMode.preview,
        status: "active",
      },
      {
        key: "fleets",
        list: "fleets",
        name: "Fleet Insurance 2027",
        description:
          "Transport and delivery companies. Offer the fleet policy with roadside assistance.",
        mode: DialerMode.progressive,
        status: "active",
      },
      {
        key: "health",
        list: "health",
        name: "SMB Health",
        description:
          "Clinics and practices. Offer liability coverage for the medical team.",
        mode: DialerMode.progressive,
        status: "active",
      },
      {
        key: "reactivation",
        list: "smb",
        name: "Client Reactivation",
        description:
          "Clients who did not renew last year. The campaign ended on September 30.",
        mode: DialerMode.preview,
        status: "completed",
      },
    ];
    campaignCount = campaigns.length;

    const attempts = todayCalls
      .map((t, i) => ({ ...t, callKey: `call:today:${i}` }))
      .filter((t) => t.campaign);
    const sessionId = id("session:renewal");

    for (const [i, campaign] of campaigns.entries()) {
      const campaignId = id(`campaign:${campaign.key}`);
      const list = LISTS.find((l) => l.key === campaign.list)!;
      await prisma.campaign.create({
        data: {
          id: campaignId,
          ...workspace,
          organizationId,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          dialerMode: campaign.mode,
          timezone: "America/Santo_Domingo",
          // Newest first in the app: the order the design lists them in.
          createdAt: new Date(now.getTime() - (20 + i) * DAY),
          updatedAt: new Date(now.getTime() - (i + 1) * HOUR),
        },
      });
      await prisma.campaignMember.createMany({
        data: [me.id, ...(teammateId ? [teammateId] : [])].map((userId) => ({
          id: id(`campaign-member:${campaign.key}:${userId}`),
          campaignId,
          userId,
          role: "agent",
        })),
      });
      const campaignListId = id(`campaign-list:${campaign.key}`);
      await prisma.campaignList.create({
        data: {
          id: campaignListId,
          campaignId,
          name: list.name,
          description: list.description,
          source: "manual",
        },
      });
      const leadContacts = [
        ...list.people.map((key) => id(`contact:${key}`)),
        ...plan.fillers.filter((f) => f.list === list.key).map((f) => f.id),
      ];
      const finished = campaign.status === "completed";
      await prisma.campaignLead.createMany({
        data: leadContacts.map((contactId, n) => {
          const attempt =
            campaign.key === "renewal"
              ? attempts.find((a) => a.filler.id === contactId)
              : undefined;
          return {
            id: id(`lead:${campaign.key}:${contactId}`),
            campaignId,
            contactId,
            listId: campaignListId,
            status: finished
              ? CampaignLeadStatus.completed
              : attempt
                ? attempt.outcome === CallOutcome.no_answer ||
                  attempt.outcome === CallOutcome.voicemail
                  ? CampaignLeadStatus.pending
                  : attempt.outcome === CallOutcome.callback_scheduled
                    ? CampaignLeadStatus.scheduled
                    : CampaignLeadStatus.completed
                : CampaignLeadStatus.pending,
            priority: 0,
            attempts: finished ? 1 : attempt ? 1 : 0,
            lastCallAt: attempt
              ? calls.find((x) => x.key === attempt.callKey)!.at
              : finished
                ? daysAgo(25, 10)
                : null,
            nextCallAt: finished ? null : new Date(now.getTime() + n * MINUTE),
            createdAt: new Date(now.getTime() - 20 * DAY + n * 1000),
          };
        }),
      });

      if (campaign.key === "renewal") {
        // The session this person left paused this morning.
        const lastAttempt = calls.find(
          (x) => x.key === attempts[attempts.length - 1]!.callKey,
        )!;
        const pausedAt = new Date(
          lastAttempt.at.getTime() + (lastAttempt.seconds + 90) * 1000,
        );
        const connected = attempts.filter((a) => a.seconds > 0);
        await prisma.agentSession.create({
          data: {
            id: sessionId,
            campaignId,
            userId: me.id,
            organizationId,
            status: AgentSessionStatus.paused,
            lastHeartbeat: pausedAt,
            startedAt: new Date(
              calls.find((x) => x.key === attempts[0]!.callKey)!.at.getTime() -
                3 * MINUTE,
            ),
            callsAttempted: attempts.length,
            callsConnected: connected.length,
            totalTalkSec: connected.reduce((sum, a) => sum + a.seconds, 0),
            updatedAt: pausedAt,
          },
        });
        await prisma.callAttempt.createMany({
          data: attempts.map((a) => {
            const call = calls.find((x) => x.key === a.callKey)!;
            const disposition = dispositionFor(a.outcome);
            const answered = a.seconds > 0;
            return {
              id: id(`attempt:${a.callKey}`),
              campaignId,
              campaignLeadId: id(`lead:renewal:${a.filler.id}`),
              callId: id(a.callKey),
              agentSessionId: sessionId,
              agentUserId: me.id,
              status: CallAttemptStatus.dispositioned,
              attemptNumber: 1,
              initiatedAt: call.at,
              ringStartedAt: new Date(call.at.getTime() + 2_000),
              answeredAt: answered
                ? new Date(call.at.getTime() + 12_000)
                : null,
              endedAt: new Date(
                call.at.getTime() +
                  (answered ? a.seconds * 1000 + 15_000 : 25_000),
              ),
              dispositionedAt: new Date(
                call.at.getTime() + (a.seconds + 40) * 1000,
              ),
              durationSec: a.seconds,
              dispositionId: disposition?.id ?? null,
              dispositionCode: disposition?.code ?? a.outcome,
              dispositionNote: a.note ?? null,
              dispositionOutcome: a.outcome,
              createdAt: call.at,
              updatedAt: call.at,
            };
          }),
        });
        // A campaign callback: it belongs to the session, not to Today.
        const callbackAttempt = attempts.find(
          (a) => a.outcome === CallOutcome.callback_scheduled,
        )!;
        await prisma.callbackTask.create({
          data: {
            id: id("callback:campaign"),
            ...workspace,
            contactId: callbackAttempt.filler.id,
            callId: id(callbackAttempt.callKey),
            campaignLeadId: id(`lead:renewal:${callbackAttempt.filler.id}`),
            scheduledAt: tomorrowAt(15, 30),
            note: callbackAttempt.note ?? null,
            status: CallbackStatus.scheduled,
          },
        });
      }
    }

    /* Voicemail greetings ─────────────────────────────────────────────── */
    // Their audio is one the workspace already uploaded, when there is one, so
    // the preview plays something.
    const existing = await prisma.voicemailDropAsset.findMany({
      where: {
        organizationId,
        deletedAt: null,
        id: { notIn: plan.greetingIds },
      },
      orderBy: { createdAt: "asc" },
    });
    const audio =
      existing[0]?.fileUrl ??
      `https://recordings.invalid/${SOURCE}/greeting.mp3`;
    const hasDefault = existing.some((a) => a.isDefault);
    await prisma.voicemailDropAsset.createMany({
      data: [
        {
          id: plan.greetingIds[0]!,
          name: "Standard greeting",
          description: "Introduces you and asks for a call back",
          durationSec: 24,
          isDefault: !hasDefault,
        },
        {
          id: plan.greetingIds[1]!,
          name: "Renewal reminder",
          description: "For policies about to expire",
          durationSec: 31,
          isDefault: false,
        },
        {
          id: plan.greetingIds[2]!,
          name: "Quote is ready",
          description: "Lets them know the quote was emailed",
          durationSec: 18,
          isDefault: false,
        },
      ].map((asset) => ({
        ...asset,
        organizationId,
        userId: me.id,
        fileUrl: audio,
      })),
    });
  }

  /* Call script, unless the person already wrote one ───────────────────── */
  const script = await prisma.callScript.findFirst({
    where: { userId: me.id, organizationId },
  });
  if (!script) {
    await prisma.callScript.create({
      data: {
        id: id("script"),
        ...workspace,
        sections: {
          create: [
            {
              id: id("script:1"),
              title: "Introduce yourself",
              body: "Say who you are and confirm you are talking to the person who decides.",
              position: 0,
            },
            {
              id: id("script:2"),
              title: "The renewal date",
              body: "Remind them when the policy expires and ask what changed this year.",
              position: 1,
            },
            {
              id: id("script:3"),
              title: "Close",
              body: "Pitch the annual plan and book the review with Finance.",
              position: 2,
            },
          ],
        },
      },
    });
  }

  console.log(
    [
      `Seeded ${label} for ${email}:`,
      `  ${contactsData.length} contacts in ${LISTS.length} lists`,
      `  ${calls.length} calls (12 of them today), ${threads.length} inbox conversations`,
      `  3 callbacks, 1 follow-up and 2 meetings on the agenda`,
      organizationId
        ? `  ${campaignCount} campaigns, a paused session and 3 voicemail greetings`
        : "  no campaigns (they need an organization: pass --org)",
      script
        ? "  your call script was left as it was"
        : "  a 3-step call script",
      "Run it again any day to bring the dates up to today.",
    ].join("\n"),
  );
}

/* ─── The plan: every id the seed owns ─────────────────────────────────── */

interface Filler {
  id: string;
  list: string;
  first: string;
  last: string;
  company: string;
  title: string;
  phone: string;
}

function buildPlan(id: (key: string) => string) {
  const rand = random(20261021);
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)]!;

  // Fictional numbers: 555-0100 to 555-0199 in each Dominican area code.
  const taken = new Set(PEOPLE.map((p) => p.phone));
  const phones: string[] = [];
  for (const area of ["809", "829", "849"]) {
    for (let n = 100; n <= 199; n++) {
      const phone = `+1${area}5550${n}`;
      if (!taken.has(phone)) phones.push(phone);
    }
  }

  const fillers: Filler[] = [];
  for (const list of LISTS) {
    for (let i = 0; i < list.fillers; i++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      fillers.push({
        id: id(`contact:${list.key}:${i}`),
        list: list.key,
        first,
        last,
        company: `${pick(list.trades)} ${pick(LAST_NAMES)}`,
        title: pick(list.titles),
        phone: phones[fillers.length]!,
      });
    }
  }

  const renewalCalled = fillers.filter((f) => f.list === "renewal").slice(0, 8);
  const smbCalled = fillers.filter((f) => f.list === "smb").slice(0, 4);
  return {
    fillers,
    renewalCalled,
    smbCalled,
    calledToday: new Set([...renewalCalled, ...smbCalled].map((f) => f.id)),
    greetingIds: [id("greeting:1"), id("greeting:2"), id("greeting:3")],
  };
}

/** Deletes every row a previous run created, children first. */
async function removeSeed(
  plan: ReturnType<typeof buildPlan>,
  id: (key: string) => string,
) {
  const contactIds = [
    ...PEOPLE.map((p) => id(`contact:${p.key}`)),
    ...plan.fillers.map((f) => f.id),
  ];
  const campaignIds = ["renewal", "fleets", "health", "reactivation"].map((k) =>
    id(`campaign:${k}`),
  );
  const threadIds = PEOPLE.map((p) => id(`thread:${p.key}`));
  const seededCalls = await prisma.call.findMany({
    where: { contactId: { in: contactIds }, source: SOURCE },
    select: { id: true },
  });
  const callIds = seededCalls.map((call) => call.id);

  await prisma.callTranscriptionSegment.deleteMany({
    where: { callId: { in: callIds } },
  });
  await prisma.callAttempt.deleteMany({
    where: { campaignId: { in: campaignIds } },
  });
  await prisma.agentSession.deleteMany({
    where: { campaignId: { in: campaignIds } },
  });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  // Messages before their threads: deleting a thread only unlinks them.
  await prisma.message.deleteMany({ where: { threadId: { in: threadIds } } });
  await prisma.inboxThread.deleteMany({ where: { id: { in: threadIds } } });
  await prisma.pendingAction.deleteMany({ where: { id: id("action:c5") } });
  await prisma.call.deleteMany({ where: { id: { in: callIds } } });
  await prisma.contactList.deleteMany({
    where: { id: { in: LISTS.map((l) => id(`list:${l.key}`)) } },
  });
  await prisma.company.deleteMany({
    where: { id: { in: PEOPLE.map((p) => id(`company:${p.key}`)) } },
  });
  await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  await prisma.voicemailDropAsset.deleteMany({
    where: { id: { in: plan.greetingIds } },
  });
  await prisma.callScript.deleteMany({ where: { id: id("script") } });
  await prisma.organizationMembership.deleteMany({
    where: { id: id("membership:carlos") },
  });
  await prisma.user.deleteMany({ where: { id: id("user:carlos") } });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
