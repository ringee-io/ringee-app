import { Injectable } from "@nestjs/common";
import { Offer, OfferParticipation } from "@ringee/database";
import { RewardBreakdown } from "./offer-reward.calculator";
import {
  OfferActionConfig,
  OfferCopy,
  OfferDisplayConfig,
  OfferEligibilityContext,
  OfferFrequencyConfig,
  PresentedOffer,
  readConfig,
} from "./offer.types";

/** `{{token}}`, optionally padded: `{{ token }}`. */
const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Renders an offer into exactly what a placement should display.
 *
 * Copy is authored as templates on `displayConfig` and resolved here, on the
 * server, so the frontend receives final strings and never has to know an
 * offer's rules or arithmetic. Interpolation is a whitelist substitution over a
 * fixed token table — not an expression evaluator — so authored copy can never
 * reach into the context or execute anything.
 */
@Injectable()
export class OfferPresenter {
  present(params: {
    offer: Offer;
    context: OfferEligibilityContext;
    reward: RewardBreakdown;
    participation: OfferParticipation | null;
  }): PresentedOffer {
    const { offer, context, reward, participation } = params;

    const display = readConfig<OfferDisplayConfig>(offer.displayConfig);
    const action = readConfig<OfferActionConfig>(offer.actionConfig);
    const frequency = readConfig<OfferFrequencyConfig>(offer.frequencyConfig);

    const variant: OfferCopy =
      (context.workspace.type === "organization"
        ? display.organization
        : display.personal) ?? {};

    const tokens = this.tokensFor(reward);

    return {
      id: offer.id,
      slug: offer.slug,
      placement: offer.placement,
      priority: offer.priority,
      title: this.render(variant.title ?? display.title ?? offer.title, tokens),
      description: this.renderOptional(
        variant.description ?? display.description ?? offer.description,
        tokens,
      ),
      cta: {
        label: this.render(
          variant.ctaLabel ?? display.ctaLabel ?? "View offer",
          tokens,
        ),
      },
      // Default to dismissible: an undismissable banner is the exception.
      dismissible: frequency.dismissible !== false,
      reward: {
        type: reward.type,
        amount: reward.amount,
        potentialAmount: reward.potentialAmount,
        currency: reward.currency,
        destination: reward.destination,
      },
      eligibleParticipants: reward.eligibleParticipants,
      remainingParticipants: reward.remainingParticipants,
      action: {
        type: action.type ?? "CTA_ONLY",
        field: action.field ?? null,
        fieldLabel: action.fieldLabel ?? null,
        fieldPlaceholder: action.fieldPlaceholder ?? null,
        helpText: action.helpText ?? null,
        helpImage: action.helpImage ?? null,
        helpImageAlt: action.helpImageAlt ?? action.helpText ?? null,
        submitLabel: action.submitLabel ?? null,
        href: action.href ?? null,
        hrefLabel: action.hrefLabel ?? null,
        allowedDomains: action.allowedDomains ?? [],
      },
      requiresApproval: offer.requiresApproval,
      participation: participation
        ? {
            id: participation.id,
            status: participation.status,
            submittedAt: participation.submittedAt?.toISOString() ?? null,
            rewardedAt: participation.rewardedAt?.toISOString() ?? null,
            rejectionReason: participation.rejectionReason,
          }
        : null,
      endsAt: offer.endsAt?.toISOString() ?? null,
    };
  }

  /**
   * The complete token vocabulary available to authored copy. Money is
   * pre-formatted so a template stays `${{rewardAmount}}` instead of carrying
   * formatting rules.
   */
  private tokensFor(reward: RewardBreakdown): Record<string, string> {
    return {
      rewardAmount: this.formatAmount(reward.amount),
      potentialReward: this.formatAmount(reward.potentialAmount),
      currency: reward.currency,
      eligibleParticipants: String(reward.eligibleParticipants),
      remainingParticipants: String(reward.remainingParticipants),
    };
  }

  /** Trims a trailing `.00` so "$10" reads better than "$10.00" on a banner. */
  private formatAmount(amount: number): string {
    if (!Number.isFinite(amount)) return "0";
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  }

  /** An unknown token renders as empty rather than leaking the raw `{{...}}`. */
  private render(template: string, tokens: Record<string, string>): string {
    return template.replace(
      TOKEN_PATTERN,
      (_match, key: string) => tokens[key] ?? "",
    );
  }

  private renderOptional(
    template: string | null | undefined,
    tokens: Record<string, string>,
  ): string | null {
    if (!template) return null;
    return this.render(template, tokens);
  }
}
