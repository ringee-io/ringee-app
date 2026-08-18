import { Injectable } from "@nestjs/common";
import { Offer, OfferAudienceType } from "@ringee/database";
import { OfferContextBuilder } from "./offer-context.builder";
import { describeFirstFailure, evaluateGroup } from "./offer-rules.engine";
import {
  OfferContextMember,
  OfferEligibilityConfig,
  OfferEligibilityContext,
  RuleGroup,
  readConfig,
} from "./offer.types";

export interface EligibilityResult {
  eligible: boolean;
  /** Diagnostic only — never returned to the end user. */
  reason?: string;
}

/**
 * Decides whether an offer applies, using only the offer's own configuration
 * and the shared context. There is no per-offer branch anywhere in this class:
 * a new promotion is a new row.
 */
@Injectable()
export class OfferEligibilityEngine {
  /** Which audience buckets a workspace of this kind can be shown. */
  audienceTypesFor(context: OfferEligibilityContext): OfferAudienceType[] {
    return context.workspace.type === "organization"
      ? ["ORGANIZATION", "BOTH"]
      : ["PERSONAL", "BOTH"];
  }

  matchesAudience(offer: Offer, context: OfferEligibilityContext): boolean {
    return this.audienceTypesFor(context).includes(offer.audienceType);
  }

  /**
   * Full check for the CURRENT user. In an organization this is both gates:
   * the workspace-level rule (does the team qualify at all) and the member-level
   * rule (does this person qualify) — the shape the review offer needs, and the
   * shape any future team offer gets for free.
   */
  evaluate(offer: Offer, context: OfferEligibilityContext): EligibilityResult {
    if (!this.matchesAudience(offer, context)) {
      return { eligible: false, reason: "audience" };
    }

    const config = this.configOf(offer);

    if (context.workspace.type === "organization") {
      const workspaceRule = config.organization?.workspace ?? config.default;
      if (workspaceRule && !evaluateGroup(workspaceRule, context)) {
        return {
          eligible: false,
          reason: describeFirstFailure(workspaceRule, context) ?? "workspace",
        };
      }

      const memberRule = config.organization?.member;
      if (memberRule && !evaluateGroup(memberRule, context)) {
        return {
          eligible: false,
          reason: describeFirstFailure(memberRule, context) ?? "member",
        };
      }

      return { eligible: true };
    }

    const personalRule = config.personal ?? config.default;
    if (personalRule && !evaluateGroup(personalRule, context)) {
      return {
        eligible: false,
        reason: describeFirstFailure(personalRule, context) ?? "personal",
      };
    }

    return { eligible: true };
  }

  /**
   * Members of the active organization who pass the member-level rule.
   *
   * Evaluated against a per-member view of the SAME context — no extra queries,
   * because every member's call count already arrived in one grouped read.
   * Returns everyone when the offer defines no member rule.
   */
  eligibleMembers(
    offer: Offer,
    context: OfferEligibilityContext,
  ): OfferContextMember[] {
    if (context.workspace.type !== "organization") return [];

    const memberRule = this.configOf(offer).organization?.member;
    if (!memberRule) return context.members;

    return context.members.filter((member) =>
      evaluateGroup(memberRule, OfferContextBuilder.forMember(context, member)),
    );
  }

  /** Whether the offer's workspace-level gate passes, ignoring the member gate. */
  workspaceQualifies(offer: Offer, context: OfferEligibilityContext): boolean {
    const config = this.configOf(offer);
    const rule: RuleGroup | undefined =
      context.workspace.type === "organization"
        ? (config.organization?.workspace ?? config.default)
        : (config.personal ?? config.default);
    return rule ? evaluateGroup(rule, context) : true;
  }

  /**
   * Normalizes `eligibilityConfig` into the variant shape. A bare rule group
   * (the `{ all: [...] }` form) becomes `default`, so both authoring styles
   * flow through the same evaluation path.
   */
  private configOf(offer: Offer): OfferEligibilityConfig {
    const raw = readConfig<Record<string, unknown>>(offer.eligibilityConfig);
    const hasVariants = "personal" in raw || "organization" in raw;
    if (hasVariants) return raw as OfferEligibilityConfig;
    if ("default" in raw) return raw as OfferEligibilityConfig;
    return { default: raw as RuleGroup };
  }
}
