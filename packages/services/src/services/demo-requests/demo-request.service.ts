import { Injectable, Logger } from "@nestjs/common";
import { DemoRequestRepository } from "@ringee/database";
import {
  OrchestratorService,
  ResendProvider,
  wasEmailAccepted,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import {
  DEMO_REQUEST_TEAM_EMAIL,
  detailsTable,
  escapeHtml,
} from "./demo-request-emails";

/** Same email can only create one request per window; extra submits are no-ops. */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export interface CreateDemoRequestInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  companyWebsite: string;
  numberOfUsers: string;
  referralSource: string;
  /** ISO 3166-1 alpha-2 country detected from the visitor's browser locale. */
  country?: string | null;
  /** Honeypot — hidden on the form, so a value means a bot submitted it. */
  fax?: string | null;
}

/**
 * Demo requests from the public marketing site (/request-demo). Visitors are
 * not signed in, so requests are standalone rows (no User relation). On
 * creation the requester gets a confirmation, the automatic review starts,
 * and the team gets a detail email. Sign-up is closed: the review creates the
 * account when the profile verifies itself, and otherwise asks the requester
 * for what is missing (LIFE-004) — no meeting is scheduled.
 */
@Injectable()
export class DemoRequestService {
  private readonly logger = new Logger(DemoRequestService.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly demoRequestRepository: DemoRequestRepository,
    private readonly orchestrator: OrchestratorService,
  ) {}

  /**
   * Store the request, confirm it, start its review and tell the team. Always
   * resolves `{ ok: true }` on accepted input: bots (honeypot) and repeat
   * submits within the rate-limit window are silently dropped, and neither an
   * email failure nor a review that cannot start fails the request — the row
   * is already stored for manual follow-up.
   */
  async createRequest(input: CreateDemoRequestInput): Promise<{ ok: true }> {
    if (input.fax?.trim()) {
      this.logger.warn(
        `Dropped demo request from ${input.email}: honeypot field was filled`,
      );
      return { ok: true };
    }

    const data = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      phoneNumber: input.phoneNumber.trim(),
      companyWebsite: input.companyWebsite.trim(),
      numberOfUsers: input.numberOfUsers.trim(),
      referralSource: input.referralSource.trim(),
      country: input.country?.trim().toUpperCase() || null,
    };

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recent = await this.demoRequestRepository.findRecentByEmail(
      data.email,
      since,
    );
    if (recent) {
      this.logger.log(
        `Skipped duplicate demo request from ${data.email} (one already exists in the last hour)`,
      );
      return { ok: true };
    }

    const request = await this.demoRequestRepository.create(data);

    // The confirmation goes first, so it reaches the requester before the
    // review's outcome does.
    try {
      await this.confirmRequester(data);
    } catch (error) {
      this.logger.error(
        `Failed to send confirmation email for demo request ${request.id}`,
        error as Error,
      );
    }

    const reviewing = await this.startReview(request.id);

    try {
      const told = await this.notifyTeam(data, reviewing);
      // With no review running, this email is how the team learns the
      // request is theirs (LIFE-004).
      if (told && !reviewing) {
        await this.demoRequestRepository.markTeamNotified(request.id);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send team email for demo request ${request.id}`,
        error as Error,
      );
    }

    return { ok: true };
  }

  /**
   * The review runs as a durable workflow. When it cannot even start, the
   * request is the team's to vet, exactly as before the review existed.
   */
  private async startReview(id: string): Promise<boolean> {
    try {
      await this.orchestrator.reviewDemoRequest(id);
      return true;
    } catch (error) {
      this.logger.error(
        `Could not start the review of demo request ${id}; leaving it to the team`,
        error as Error,
      );
      await this.demoRequestRepository
        .markManualReview(id, "The automatic review could not start")
        .catch((markError: Error) =>
          this.logger.error(
            `Could not mark demo request ${id} for manual review; it stays "received"`,
            markError,
          ),
        );
      return false;
    }
  }

  /** Full-detail email to the team inbox. True once the provider took it. */
  private async notifyTeam(
    data: Omit<CreateDemoRequestInput, "fax">,
    reviewing: boolean,
  ): Promise<boolean> {
    const fullName = `${data.firstName} ${data.lastName}`.trim();
    const next = reviewing
      ? "Ringee is reviewing this profile automatically. You will be copied on the outcome: their account and credentials, or the details they are asked for."
      : "The automatic review could not start. Vet the profile and create their account from the backoffice (New account).";
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717;">
        <h2 style="margin: 0 0 12px;">New demo request</h2>
        <p>${escapeHtml(fullName)} requested a Ringee demo from the marketing site.</p>
        ${detailsTable(data)}
        <p style="margin-top: 16px; color: #737373;">
          ${next} Reply to this email to reach them directly.
        </p>
      </div>
    `;

    const result: unknown = await this.email.sendEmail(
      DEMO_REQUEST_TEAM_EMAIL,
      `New demo request — ${fullName}`,
      html,
      "Ringee Notifications",
      apiConfiguration.EMAIL_FROM_ADDRESS,
      data.email,
    );
    return wasEmailAccepted(result);
  }

  /** Confirmation email to the requester, echoing what they submitted. */
  private async confirmRequester(
    data: Omit<CreateDemoRequestInput, "fax">,
  ): Promise<void> {
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717;">
        <h2 style="margin: 0 0 12px;">We got your demo request</h2>
        <p>Hi ${escapeHtml(data.firstName)},</p>
        <p>
          Thanks for your interest in Ringee. We received your request and are
          reviewing your details — no meeting needed. Once approved, we&#39;ll
          set up your account and you&#39;ll get access by email, usually
          within one business day.
        </p>
        <p style="margin: 16px 0 8px;"><strong>What you submitted:</strong></p>
        ${detailsTable(data)}
        <p style="margin-top: 16px;">
          Anything wrong or want to add context? Just reply to this email.
        </p>
        <p style="margin-top: 16px; color: #737373;">— The Ringee team</p>
      </div>
    `;

    await this.email.sendEmail(
      data.email,
      "We got your demo request — Ringee",
      html,
      "Ringee",
      apiConfiguration.EMAIL_FROM_ADDRESS,
      DEMO_REQUEST_TEAM_EMAIL,
    );
  }
}
