import { Injectable } from "@nestjs/common";
import type { LeadCandidate } from "@ringee/platform";

export interface BuyerSignals {
  /** Titles seen in past won calls (lowercased). */
  titles: string[];
  /** Seniorities seen (lowercased). */
  seniorities: string[];
  /** Industries seen (lowercased). */
  industries: string[];
  /** Country names or codes (lowercased). */
  countries: string[];
  /** Company size ranges seen. */
  sizes: string[];
}

export interface ScoredProspect {
  candidate: LeadCandidate;
  score: number;
  reasons: string[];
}

/**
 * Lightweight, explainable lead scoring used by the Prospecting Expert Agent.
 *
 * The score isn't ML — it's a transparent weighted sum so the agent can show
 * the user *why* a lead fits. Anything fancier requires data we don't have
 * yet (won-rate per segment, response rates, etc.) and would defeat the goal
 * of being explainable.
 */
@Injectable()
export class ProspectScoringService {
  score(candidate: LeadCandidate, signals: BuyerSignals | null): ScoredProspect {
    const reasons: string[] = [];
    let score = 0;

    const titleLc = candidate.person.jobTitle?.toLowerCase() ?? "";
    const seniorityLc = candidate.person.seniority?.toLowerCase() ?? "";
    const industryLc = candidate.company?.industry?.toLowerCase() ?? "";
    const countryLc =
      candidate.person.location?.country?.toLowerCase() ??
      candidate.company?.hq?.country?.toLowerCase() ??
      "";
    const sizeLc =
      candidate.company?.employeeCountRange?.toLowerCase() ??
      candidate.company?.size?.toLowerCase() ??
      "";

    // Title fit
    if (titleLc) {
      const hit = signals?.titles.find((t) => titleLc.includes(t));
      if (hit) {
        score += 25;
        reasons.push(`Title matches past winners: "${candidate.person.jobTitle}"`);
      }
    }

    // Seniority fit
    if (seniorityLc && signals?.seniorities.includes(seniorityLc)) {
      score += 15;
      reasons.push(`Seniority "${seniorityLc}" matches your closed deals`);
    }

    // Industry fit
    if (industryLc) {
      const hit = signals?.industries.find((i) => industryLc.includes(i));
      if (hit) {
        score += 15;
        reasons.push(`Industry "${industryLc}" common among your wins`);
      }
    }

    // Geography fit
    if (countryLc && signals?.countries.includes(countryLc)) {
      score += 10;
      reasons.push(`Located in ${candidate.person.location?.country ?? countryLc} — a known winning market`);
    }

    // Size fit
    if (sizeLc && signals?.sizes.includes(sizeLc)) {
      score += 10;
      reasons.push(`Company size ${sizeLc} matches past customers`);
    }

    // Contact availability
    if (candidate.person.emails.some((e) => e.value)) {
      score += 8;
      reasons.push("Email is available");
    }
    if (candidate.person.phones.some((p) => p.value)) {
      score += 7;
      reasons.push("Phone is available");
    }
    if (candidate.person.emails.some((e) => e.verified)) {
      score += 5;
      reasons.push("Email is verified");
    }

    // Provider confidence
    if (typeof candidate.confidence === "number") {
      score += Math.round(candidate.confidence * 5);
      if (candidate.confidence > 0.8) {
        reasons.push(`High provider confidence (${Math.round(candidate.confidence * 100)}%)`);
      }
    }

    // Cap at 100
    score = Math.min(100, score);

    if (reasons.length === 0) {
      reasons.push(
        "Profile matches the broad search criteria, but no strong signals against your past buyers yet.",
      );
    }

    return { candidate, score, reasons };
  }

  scoreMany(
    candidates: LeadCandidate[],
    signals: BuyerSignals | null,
  ): ScoredProspect[] {
    return candidates
      .map((c) => this.score(c, signals))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Derive coarse signals from a sample of past won contacts/calls. Empty
   * arrays just means we have nothing to lookalike against yet.
   */
  buildSignalsFromContacts(
    contacts: Array<{
      jobTitle?: string | null;
      seniority?: string | null;
      industry?: string | null;
      country?: string | null;
      companySize?: string | null;
    }>,
  ): BuyerSignals {
    const sig: BuyerSignals = {
      titles: [],
      seniorities: [],
      industries: [],
      countries: [],
      sizes: [],
    };
    for (const c of contacts) {
      const t = c.jobTitle?.toLowerCase().trim();
      if (t && !sig.titles.includes(t)) sig.titles.push(t);
      const s = c.seniority?.toLowerCase().trim();
      if (s && !sig.seniorities.includes(s)) sig.seniorities.push(s);
      const i = c.industry?.toLowerCase().trim();
      if (i && !sig.industries.includes(i)) sig.industries.push(i);
      const co = c.country?.toLowerCase().trim();
      if (co && !sig.countries.includes(co)) sig.countries.push(co);
      const sz = c.companySize?.toLowerCase().trim();
      if (sz && !sig.sizes.includes(sz)) sig.sizes.push(sz);
    }
    return sig;
  }
}
