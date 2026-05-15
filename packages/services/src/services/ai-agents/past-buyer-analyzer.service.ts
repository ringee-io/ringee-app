import { Injectable, Logger } from "@nestjs/common";
import {
  CallOutcome,
  CallRepository,
  ContactRepository,
} from "@ringee/database";
import { OwnershipContext, buildOwnershipFilter } from "@ringee/platform";
import { PrismaService } from "@ringee/database";
import {
  BuyerSignals,
  ProspectScoringService,
} from "./prospect-scoring.service";

const POSITIVE_OUTCOMES: CallOutcome[] = ["sale", "meeting_booked", "interested"];

export interface PastBuyerAnalysis {
  count: number;
  /** Most common observed values (top 5 each). */
  topJobTitles: { value: string; count: number }[];
  topSeniorities: { value: string; count: number }[];
  topIndustries: { value: string; count: number }[];
  topCountries: { value: string; count: number }[];
  topCompanySizes: { value: string; count: number }[];
  signals: BuyerSignals;
  sampleContactIds: string[];
}

/**
 * Pulls "won" / "meeting-booked" / "interested" contacts from past calls
 * and infers ICP signals. Used both as a chat-facing tool and as input
 * to the lead scoring service.
 */
@Injectable()
export class PastBuyerAnalyzerService {
  private readonly logger = new Logger(PastBuyerAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callRepo: CallRepository,
    private readonly contactRepo: ContactRepository,
    private readonly scoring: ProspectScoringService,
  ) {}

  async analyze(ctx: OwnershipContext, limit = 200): Promise<PastBuyerAnalysis> {
    const ownershipFilter = buildOwnershipFilter(ctx);

    // Find recent calls with a positive outcome and pull their contacts.
    const calls = await this.prisma.call.findMany({
      where: {
        ...ownershipFilter,
        outcome: { in: POSITIVE_OUTCOMES },
        contactId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { contactId: true, outcome: true },
    });

    const contactIds = Array.from(
      new Set(calls.map((c) => c.contactId).filter(Boolean) as string[]),
    );
    if (contactIds.length === 0) {
      return {
        count: 0,
        topJobTitles: [],
        topSeniorities: [],
        topIndustries: [],
        topCountries: [],
        topCompanySizes: [],
        signals: this.scoring.buildSignalsFromContacts([]),
        sampleContactIds: [],
      };
    }

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        jobTitle: true,
        seniority: true,
        locationCountry: true,
        company: true,
      },
    });

    // Pull company industries via the Company table where contact.company matches.
    // (Best-effort: works when the contact was enriched. Otherwise skipped.)
    const companyNames = Array.from(
      new Set(contacts.map((c) => c.company).filter(Boolean) as string[]),
    );
    const companies = companyNames.length
      ? await this.prisma.company.findMany({
          where: { name: { in: companyNames } },
          select: { name: true, industry: true, employeeCountRange: true },
        })
      : [];
    const companyMap = new Map(companies.map((c) => [c.name ?? "", c]));

    const enriched = contacts.map((c) => {
      const company = c.company ? companyMap.get(c.company) : null;
      return {
        jobTitle: c.jobTitle,
        seniority: c.seniority,
        industry: company?.industry ?? null,
        country: c.locationCountry,
        companySize: company?.employeeCountRange ?? null,
      };
    });

    return {
      count: contacts.length,
      topJobTitles: topN(enriched.map((e) => e.jobTitle)),
      topSeniorities: topN(enriched.map((e) => e.seniority)),
      topIndustries: topN(enriched.map((e) => e.industry)),
      topCountries: topN(enriched.map((e) => e.country)),
      topCompanySizes: topN(enriched.map((e) => e.companySize)),
      signals: this.scoring.buildSignalsFromContacts(enriched),
      sampleContactIds: contactIds.slice(0, 10),
    };
  }
}

function topN(values: Array<string | null | undefined>, n = 5) {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    const key = v.toString().trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
