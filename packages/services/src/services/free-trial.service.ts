import { Injectable, Logger } from "@nestjs/common";
import {
  FreeTrialCallRequestRepository,
  FreeTrialRequestStatus,
  UserRepository,
} from "@ringee/database";
import { ResendProvider } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

/** Onboarding step id kept in sync with OnboardingService.ALL_STEPS. */
const REQUEST_STEP = "request_free_call";

/**
 * Internal inbox the Ringee team reviews. Free trial calls are granted
 * manually, so every request is emailed here (the same address used for
 * account/credit requests).
 */
const RINGEE_TEAM_EMAIL = "edisonpadilla.dev@gmail.com";

export interface FreeTrialRequestState {
  hasRequested: boolean;
  status: FreeTrialRequestStatus | null;
}

/**
 * Free-trial call requests. A user asks the Ringee team for a free call to try
 * the service; the team reviews it manually (an email is sent on creation).
 * Exactly one request per user is allowed.
 */
@Injectable()
export class FreeTrialService {
  private readonly logger = new Logger(FreeTrialService.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly freeTrialRepository: FreeTrialCallRequestRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async getRequest(userId: string): Promise<FreeTrialRequestState> {
    const existing = await this.freeTrialRepository.findByUserId(userId);
    return {
      hasRequested: !!existing,
      status: existing?.status ?? null,
    };
  }

  /**
   * Create the user's single free-trial request. Idempotent: if one already
   * exists it is returned untouched and no duplicate email is sent.
   */
  async createRequest(
    userId: string,
    note?: string | null,
  ): Promise<FreeTrialRequestState & { created: boolean }> {
    const existing = await this.freeTrialRepository.findByUserId(userId);
    if (existing) {
      return {
        created: false,
        hasRequested: true,
        status: existing.status,
      };
    }

    const request = await this.freeTrialRepository.create(userId, note);

    // Best-effort: mark the onboarding step done so the guide reflects it even
    // if the client doesn't call complete itself.
    try {
      await this.userRepository.completeOnboardingStep(userId, REQUEST_STEP);
    } catch (error) {
      this.logger.warn(
        `Could not complete onboarding step for user ${userId}: ${(error as Error).message}`,
      );
    }

    // Best-effort: notifying the team must never fail the request itself.
    try {
      await this.notifyTeam(userId, note);
    } catch (error) {
      this.logger.error(
        `Failed to send free-trial request email for user ${userId}`,
        error as Error,
      );
    }

    return {
      created: true,
      hasRequested: true,
      status: request.status,
    };
  }

  private async notifyTeam(
    userId: string,
    note?: string | null,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    const emails =
      (user as unknown as { emails?: { email: string; isPrimary: boolean }[] })
        ?.emails ?? [];
    const requesterEmail =
      emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? null;
    const fullName =
      `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
      "A Ringee user";
    const noteLine = note?.trim()
      ? `<p><strong>Note:</strong> ${this.escapeHtml(note.trim())}</p>`
      : "";

    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717;">
        <h2 style="margin: 0 0 12px;">New free call request</h2>
        <p>${this.escapeHtml(fullName)} has requested a free trial call to try Ringee.</p>
        <p><strong>User:</strong> ${this.escapeHtml(fullName)}${
          requesterEmail ? ` (${this.escapeHtml(requesterEmail)})` : ""
        }</p>
        <p><strong>User ID:</strong> ${userId}</p>
        ${noteLine}
        <p style="margin-top: 16px; color: #737373;">
          Review the request and reach out to the user to grant their free call.
        </p>
      </div>
    `;

    // Send to the team; the requester is copied so they have a confirmation.
    const recipients = Array.from(
      new Set(
        [RINGEE_TEAM_EMAIL, requesterEmail].filter((e): e is string => !!e),
      ),
    );

    await this.email.sendEmail(
      recipients,
      "New free call request — Ringee",
      html,
      "Ringee Notifications",
      apiConfiguration.EMAIL_FROM_ADDRESS,
      RINGEE_TEAM_EMAIL,
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
