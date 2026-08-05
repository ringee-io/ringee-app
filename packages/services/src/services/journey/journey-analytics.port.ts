import { Injectable, Logger } from "@nestjs/common";

/**
 * Product analytics for the Journey, decoupled from any provider.
 *
 * The app's only existing analytics surface is a browser-side gtag/Ahrefs hook,
 * which cannot see server-side truth (achievements, claim outcomes, risk
 * bands). Rather than couple this module to a vendor SDK that does not exist
 * here yet, events go through this port; the default implementation writes a
 * single structured log line per event, which any log-based pipeline can
 * ingest. Swapping in Segment/PostHog later is one provider binding.
 *
 * **No PII crosses this boundary.** Phone numbers, e-mails, contact names,
 * transcripts and recording URLs are not accepted by the payload type at all —
 * that is enforced by `JourneyEventProps` being a closed shape rather than a
 * free-form record.
 */

export const JOURNEY_EVENTS = [
  "journey_viewed",
  "journey_started",
  "journey_next_action_clicked",
  "journey_requirement_completed",
  /** A node was opened in the drawer — the graph's engagement signal. */
  "journey_node_viewed",
  "journey_node_achieved",
  /** A whole track's completion rule was satisfied. Fired once per track. */
  "journey_track_completed",
  "journey_reward_claim_clicked",
  "journey_reward_claimed",
  "journey_reward_pending_review",
  "journey_reward_rejected",
  "journey_node_celebrated",
  "journey_completed",
] as const;

export type JourneyEventName = (typeof JOURNEY_EVENTS)[number];

/** The complete, closed set of properties an event may carry. */
export interface JourneyEventProps {
  workspaceType?: "personal" | "organization";
  /** Hashed workspace id — correlatable, not identifying. */
  workspaceRef?: string;
  programVersion?: string;
  /** v3 graph node id, e.g. `core.rhythm`. */
  nodeId?: string;
  /** v3 track id, e.g. `integrations`. */
  trackId?: string;
  trackMode?: "required" | "elective";
  requirementId?: string;
  /** Stable rollout bucket, so cohorts can be compared. */
  experimentCohort?: string;
  holdout?: boolean;
  daysSinceSignup?: number;
  /** Seconds from workspace creation to reaching the node. */
  timeToNodeSeconds?: number;
  /** Seconds from workspace creation to completing the track. */
  timeToTrackSeconds?: number;
  /** Seconds from workspace creation to finishing the Journey. */
  timeToJourneySeconds?: number;
  /** How many elective tracks were complete at the time of the event. */
  electiveTracksCompleted?: number;
  /**
   * Which tracks the workspace actually finished, comma-separated and ordered.
   * The point of an elective model is that different workspaces finish
   * differently; without this the funnel cannot tell those paths apart.
   */
  completionPath?: string;
  riskBand?: string;
  rewardAmountCents?: number;
  productSurface?: string;
  scope?: "personal" | "organization";
  status?: string;
  reason?: string;
}

export abstract class JourneyAnalyticsPort {
  abstract track(name: JourneyEventName, props: JourneyEventProps): void;
}

/**
 * Structured-log implementation.
 *
 * Emitted after the transaction commits, never inside it: an analytics failure
 * must not be able to roll back a payment, and an event must never describe
 * something that did not happen.
 */
@Injectable()
export class LoggingJourneyAnalytics extends JourneyAnalyticsPort {
  private readonly logger = new Logger("JourneyAnalytics");

  track(name: JourneyEventName, props: JourneyEventProps): void {
    try {
      this.logger.log(JSON.stringify({ event: name, ...props }));
    } catch {
      // Analytics is never allowed to break the request it describes.
      this.logger.warn(`Failed to serialise journey event ${name}`);
    }
  }
}
