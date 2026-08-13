import { Injectable, Logger } from "@nestjs/common";
import { DemoRequestRepository } from "@ringee/database";
import { ResendProvider } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

/**
 * Internal inbox the Ringee team reviews. Every demo request is emailed here
 * (the same address used for free-trial and credit requests).
 */
const RINGEE_TEAM_EMAIL = "edisonpadilla.dev@gmail.com";

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
 * creation the team gets a detail email and the requester a confirmation.
 * Sign-up is closed: the team vets each profile and creates the account
 * directly — no meeting is scheduled.
 */
@Injectable()
export class DemoRequestService {
  private readonly logger = new Logger(DemoRequestService.name);
  private readonly email = new ResendProvider();

  constructor(private readonly demoRequestRepository: DemoRequestRepository) {}

  /**
   * Store the request and send both emails. Always resolves `{ ok: true }` on
   * accepted input: bots (honeypot) and repeat submits within the rate-limit
   * window are silently dropped, and email failures never fail the request —
   * the row is already stored for manual follow-up.
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

    try {
      await this.notifyTeam(data);
    } catch (error) {
      this.logger.error(
        `Failed to send team email for demo request ${request.id}`,
        error as Error,
      );
    }

    try {
      await this.confirmRequester(data);
    } catch (error) {
      this.logger.error(
        `Failed to send confirmation email for demo request ${request.id}`,
        error as Error,
      );
    }

    return { ok: true };
  }

  /** Full-detail email to the team inbox. */
  private async notifyTeam(
    data: Omit<CreateDemoRequestInput, "fax">,
  ): Promise<void> {
    const fullName = `${data.firstName} ${data.lastName}`.trim();
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717;">
        <h2 style="margin: 0 0 12px;">New demo request</h2>
        <p>${this.escapeHtml(fullName)} requested a Ringee demo from the marketing site.</p>
        ${this.detailsTable(data)}
        <p style="margin-top: 16px; color: #737373;">
          Vet the profile and create their account. Reply to this email to
          reach them directly.
        </p>
      </div>
    `;

    await this.email.sendEmail(
      RINGEE_TEAM_EMAIL,
      `New demo request — ${fullName}`,
      html,
      "Ringee Notifications",
      apiConfiguration.EMAIL_FROM_ADDRESS,
      data.email,
    );
  }

  /** Confirmation email to the requester, echoing what they submitted. */
  private async confirmRequester(
    data: Omit<CreateDemoRequestInput, "fax">,
  ): Promise<void> {
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717;">
        <h2 style="margin: 0 0 12px;">We got your demo request</h2>
        <p>Hi ${this.escapeHtml(data.firstName)},</p>
        <p>
          Thanks for your interest in Ringee. We received your request and are
          reviewing your details — no meeting needed. Once approved, we&#39;ll
          set up your account and you&#39;ll get access by email, usually
          within one business day.
        </p>
        <p style="margin: 16px 0 8px;"><strong>What you submitted:</strong></p>
        ${this.detailsTable(data)}
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
      RINGEE_TEAM_EMAIL,
    );
  }

  private detailsTable(data: Omit<CreateDemoRequestInput, "fax">): string {
    const rows: [string, string][] = [
      ["Name", `${data.firstName} ${data.lastName}`.trim()],
      ["Email", data.email],
      ["Phone", data.phoneNumber],
      ["Company website", data.companyWebsite],
      ["Number of users", data.numberOfUsers],
      ["How they found us", data.referralSource],
    ];
    if (data.country) {
      rows.push(["Country (browser)", this.countryLabel(data.country)]);
    }
    const cells = rows
      .map(
        ([label, value]) => `
          <tr>
            <td style="padding: 6px 16px 6px 0; color: #737373; white-space: nowrap;">${label}</td>
            <td style="padding: 6px 0;"><strong>${this.escapeHtml(value)}</strong></td>
          </tr>`,
      )
      .join("");
    return `<table style="border-collapse: collapse; font-size: 14px;">${cells}</table>`;
  }

  /** "DO" -> "Dominican Republic (DO)"; falls back to the raw code. */
  private countryLabel(code: string): string {
    try {
      const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
      return name && name !== code ? `${name} (${code})` : code;
    } catch {
      return code;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
