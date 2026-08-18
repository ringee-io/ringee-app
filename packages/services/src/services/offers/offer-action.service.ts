import { BadRequestException, Injectable } from "@nestjs/common";
import { Offer } from "@ringee/database";
import { OfferActionConfig, OfferActionType, readConfig } from "./offer.types";

export interface NormalizedSubmission {
  /** Stored verbatim on `submissionData` — never a per-offer column. */
  data: Record<string, unknown>;
  /**
   * Canonical form used to enforce cross-participant uniqueness, or null when
   * the offer does not require it.
   */
  fingerprint: string | null;
}

/**
 * Validates and normalizes whatever the user submitted, according to the
 * offer's `actionConfig`.
 *
 * Adding an action type means adding a case here; it never means teaching the
 * rest of the system about a specific offer. "Trustpilot" is not a type — it is
 * `EXTERNAL_URL_SUBMISSION` with `allowedDomains: ["trustpilot.com"]`.
 */
@Injectable()
export class OfferActionService {
  configOf(offer: Offer): OfferActionConfig {
    const config = readConfig<OfferActionConfig>(offer.actionConfig);
    return { ...config, type: (config.type ?? "CTA_ONLY") as OfferActionType };
  }

  /** Whether this action expects the user to send anything at all. */
  requiresSubmission(offer: Offer): boolean {
    return this.configOf(offer).type === "EXTERNAL_URL_SUBMISSION";
  }

  normalize(
    offer: Offer,
    submissionData: Record<string, unknown> | undefined,
  ): NormalizedSubmission {
    const config = this.configOf(offer);

    switch (config.type) {
      case "EXTERNAL_URL_SUBMISSION":
        return this.normalizeUrlSubmission(config, submissionData);
      case "INTERNAL_ACTION":
      case "CTA_ONLY":
      default:
        // Nothing to validate, but keep any payload the client sent so the
        // backoffice can still see what happened.
        return { data: submissionData ?? {}, fingerprint: null };
    }
  }

  private normalizeUrlSubmission(
    config: OfferActionConfig,
    submissionData: Record<string, unknown> | undefined,
  ): NormalizedSubmission {
    const field = config.field ?? "url";
    const raw = submissionData?.[field];

    if (typeof raw !== "string" || raw.trim() === "") {
      throw new BadRequestException(`"${field}" is required.`);
    }

    const url = this.parseUrl(raw.trim());
    this.assertAllowedDomain(url, config.allowedDomains ?? []);

    return {
      // The absolute URL is stored as submitted (minus whitespace) so a
      // reviewer can open the real page; the canonical form is only ever the
      // dedup key.
      data: { ...(submissionData ?? {}), [field]: url.toString() },
      fingerprint: config.unique === false ? null : this.canonicalUrl(url),
    };
  }

  private parseUrl(value: string): URL {
    let candidate = value;
    // Accept "trustpilot.com/review/..." as well as a full URL.
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new BadRequestException("Enter a valid URL.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new BadRequestException("Enter a valid http(s) URL.");
    }
    return url;
  }

  /**
   * Matches the host exactly or as a subdomain, so "trustpilot.com" accepts
   * "www.trustpilot.com" but rejects "trustpilot.com.evil.test".
   */
  private assertAllowedDomain(url: URL, allowedDomains: string[]): void {
    if (allowedDomains.length === 0) return;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const allowed = allowedDomains.some((domain) => {
      const normalized = domain
        .toLowerCase()
        .replace(/^www\./, "")
        .trim();
      return host === normalized || host.endsWith(`.${normalized}`);
    });

    if (!allowed) {
      throw new BadRequestException(
        `The link must point to ${allowedDomains.join(" or ")}.`,
      );
    }
  }

  /**
   * Strips the parts that do not change which page was submitted (scheme,
   * "www.", tracking query, fragment, trailing slash), so two spellings of the
   * same link collide on the uniqueness constraint.
   */
  private canonicalUrl(url: URL): string {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  }
}
