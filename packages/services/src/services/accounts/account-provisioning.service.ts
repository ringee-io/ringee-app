import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { DemoRequest, DemoRequestRepository } from "@ringee/database";
import {
  ClerkUserCreationError,
  ClerkUserRepository,
  ResendProvider,
  wasEmailAccepted,
} from "@ringee/platform";
import { UserService } from "../user.service";
import { generateTemporaryPassword } from "./temporary-password";

/**
 * Copied on every email Ringee sends a new account, or a demo requester about
 * their request, so the team sees each one (LIFE-004, LIFE-005).
 */
export const ACCOUNTS_CC_EMAIL = "edison@getringee.com";

/** These emails are written in Edison's voice ("I have created your account"). */
export const ACCOUNTS_SENDER_NAME = "Edison from Ringee";

/** Who made a login, as recorded in its Clerk private metadata. */
export type ProvisionedBy = "backoffice" | "demo_request";

export interface NewAccountInput {
  firstName: string;
  lastName: string;
  email: string;
}

export interface CreatedAccount {
  /** The Ringee user, once its row exists (the Clerk webhook writes it too). */
  userId: string | null;
  clerkUserId: string;
  email: string;
  /** Whether the credentials email was accepted by the provider. */
  emailSent: boolean;
  /** Only when the email was not sent, so staff can hand the password over. */
  temporaryPassword: string | null;
}

export type DemoRequestLogin =
  | { kind: "created" | "recovered"; clerkUserId: string }
  /** The email already has a login that Ringee did not make for this request. */
  | { kind: "taken" };

export interface CredentialsEmailView {
  firstName: string;
  email: string;
  password: string;
  /** The email opens by thanking them for the demo request. */
  requestedDemo: boolean;
}

/**
 * Logins Ringee creates itself (LIFE-005), from the backoffice or for an
 * approved demo request. The password is generated here, emailed to the
 * person with the team copied, and stored nowhere.
 */
@Injectable()
export class AccountProvisioningService {
  private readonly logger = new Logger(AccountProvisioningService.name);
  private readonly email = new ResendProvider();
  private readonly logins: Pick<
    typeof ClerkUserRepository,
    "createUser" | "findByEmail" | "setPassword"
  > = ClerkUserRepository;

  constructor(
    private readonly demoRequests: DemoRequestRepository,
    private readonly users: UserService,
  ) {}

  /**
   * Staff create a login from a name and an email. When the person had asked
   * for a demo, the email thanks them for it and their request is closed with
   * the new login.
   */
  async createAccount(input: NewAccountInput): Promise<CreatedAccount> {
    const person = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
    };
    if (!person.firstName || !person.lastName || !person.email) {
      throw new BadRequestException(
        "First name, last name and email are required.",
      );
    }

    const demoRequest = await this.demoRequests.findLatestWithoutAccount(
      person.email,
    );
    const password = generateTemporaryPassword();
    const provisionedBy: ProvisionedBy = "backoffice";

    let clerkUserId: string;
    try {
      ({ id: clerkUserId } = await this.logins.createUser({
        ...person,
        password,
        privateMetadata: { provisionedBy },
      }));
    } catch (error) {
      throw toHttpException(error);
    }

    const userId = await this.syncUser(clerkUserId);
    const emailSent = await this.sendCredentials({
      firstName: person.firstName,
      email: person.email,
      password,
      requestedDemo: demoRequest !== null,
    });

    if (demoRequest) {
      await this.demoRequests
        .recordManualAccount(demoRequest.id, clerkUserId, emailSent)
        .catch((error: Error) =>
          this.logger.warn(
            `Could not close demo request ${demoRequest.id} with the new login: ${error.message}`,
          ),
        );
    }

    this.logger.log(
      `Backoffice created Clerk user ${clerkUserId}; credentials email ${emailSent ? "sent" : "NOT sent"}`,
    );
    return {
      userId,
      clerkUserId,
      email: person.email,
      emailSent,
      temporaryPassword: emailSent ? null : password,
    };
  }

  /**
   * The login of an approved demo request, made at most once. A retry finds
   * the one an earlier attempt made — recorded on the request, or marked with
   * its id in Clerk — and gives it this password instead, which is safe
   * because the earlier one was never delivered. A login the email already
   * had is never touched.
   */
  async ensureDemoRequestLogin(
    request: Pick<
      DemoRequest,
      "id" | "email" | "firstName" | "lastName" | "clerkUserId"
    >,
    password: string,
  ): Promise<DemoRequestLogin> {
    if (request.clerkUserId) {
      await this.logins.setPassword(request.clerkUserId, password);
      return { kind: "recovered", clerkUserId: request.clerkUserId };
    }

    const existing = await this.logins.findByEmail(request.email);
    if (existing) {
      if (existing.privateMetadata.demoRequestId !== request.id) {
        return { kind: "taken" };
      }
      await this.logins.setPassword(existing.id, password);
      return { kind: "recovered", clerkUserId: existing.id };
    }

    const provisionedBy: ProvisionedBy = "demo_request";
    try {
      const { id } = await this.logins.createUser({
        email: request.email,
        firstName: request.firstName,
        lastName: request.lastName,
        password,
        privateMetadata: { provisionedBy, demoRequestId: request.id },
      });
      await this.syncUser(id);
      return { kind: "created", clerkUserId: id };
    } catch (error) {
      // The email was taken between the lookup and the create.
      if (
        error instanceof ClerkUserCreationError &&
        error.reason === "email_taken"
      ) {
        return { kind: "taken" };
      }
      throw error;
    }
  }

  /** True once the provider accepted the credentials email. */
  async sendCredentials(view: CredentialsEmailView): Promise<boolean> {
    const { subject, html } = buildCredentialsEmail(view);
    const result: unknown = await this.email
      .sendEmail(
        view.email,
        subject,
        html,
        ACCOUNTS_SENDER_NAME,
        apiConfiguration.EMAIL_FROM_ADDRESS,
        undefined,
        [ACCOUNTS_CC_EMAIL],
      )
      .catch((error: Error) => ({ error }));
    return wasEmailAccepted(result);
  }

  /**
   * Write the Ringee user now instead of waiting for the Clerk webhook, so the
   * backoffice can link to it at once. Both paths are idempotent (LIFE-001);
   * when this one fails, the webhook still does it.
   */
  private async syncUser(clerkUserId: string): Promise<string | null> {
    try {
      const { user, clerkUser } = await this.users.syncFromClerk(clerkUserId);
      await this.users.linkRingeeIdToClerk(clerkUserId, clerkUser, user.id);
      return user.id;
    } catch (error) {
      this.logger.warn(
        `Could not sync new Clerk user ${clerkUserId} yet, leaving it to the webhook: ${(error as Error).message}`,
      );
      return null;
    }
  }
}

/**
 * The email Edison used to send by hand, now sent for him: the login, the
 * temporary password, and where to change it.
 */
export function buildCredentialsEmail(view: CredentialsEmailView): {
  subject: string;
  html: string;
} {
  const base = (apiConfiguration.FRONTEND_URL ?? "").replace(/\/+$/, "");
  const signInUrl = `${base}/auth/sign-in`;
  const securityUrl = `${base}/dashboard/profile/security`;
  const thanks = view.requestedDemo
    ? "<p>Thank you for requesting a Ringee demo.</p>"
    : "";

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717; line-height: 1.5;">
      <p>Hi ${escapeHtml(view.firstName)},</p>
      ${thanks}
      <p>I have created your account so you can start exploring Ringee:</p>
      <table style="border-collapse: collapse; font-size: 14px; margin: 4px 0 12px;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #737373;">Email:</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(view.email)}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #737373;">Temporary password:</td>
          <td style="padding: 4px 0;"><strong style="font-family: SFMono-Regular, Menlo, Consolas, monospace;">${escapeHtml(view.password)}</strong></td>
        </tr>
      </table>
      <p>
        You can <a href="${signInUrl}">log in to Ringee</a> and, once inside,
        change your password here:
      </p>
      <p><a href="${securityUrl}">${securityUrl}</a></p>
      <p>
        If you have any questions or need help with anything, please don&#39;t
        hesitate to reply to this email. I&#39;ll be happy to assist you.
      </p>
    </div>
  `;

  return { subject: "Your Ringee account is ready", html };
}

/** Clerk's refusal, as the status the backoffice should see. */
function toHttpException(error: unknown): HttpException {
  if (!(error instanceof ClerkUserCreationError)) {
    return new BadGatewayException(
      `Clerk could not create the account: ${(error as Error)?.message ?? error}`,
    );
  }
  switch (error.reason) {
    case "email_taken":
      return new ConflictException(
        "An account with this email already exists.",
      );
    case "invalid_email":
      return new BadRequestException(error.message);
    default:
      return new BadGatewayException(
        `Clerk could not create the account: ${error.message}`,
      );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
