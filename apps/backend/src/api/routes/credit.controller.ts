import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CreditService, UserService } from "@ringee/services";
import {
  CurrentUser,
  createOwnershipContext,
  OrgAdminOnly,
  UpdateAutoReloadSettingsDto,
  RequestCreditDto,
  ResendProvider,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

// Internal recipient always copied on account requests so the team can action
// them manually (the mobile apps deliberately avoid in-app purchases).
const CREDIT_REQUEST_INTERNAL_CC = "edisonpadilla.dev@gmail.com";

@Controller("credits")
export class CreditController {
  private readonly logger = new Logger(CreditController.name);
  private readonly email = new ResendProvider();

  constructor(
    private readonly creditService: CreditService,
    private readonly userService: UserService,
  ) {}

  @Get("balance")
  async getBalance(@CurrentUser() user: CurrentUserData) {
    const dbUser = await this.userService.getCachedUserById(user.id);

    if (!dbUser?.id) {
      throw new NotFoundException("User not found");
    }

    try {
      const ctx = createOwnershipContext(user);
      const balance = await this.creditService.getBalance(ctx);

      return {
        balance,
        freeCallTrial: dbUser.freeCallTrial,
      };
    } catch (error) {
      return {
        balance: 0,
        freeCallTrial: false,
      };
    }
  }

  @Patch("/consume-free-call-trial")
  async consumeFreeCallTrial(@CurrentUser() user: CurrentUserData) {
    return this.userService.consumeFreeCallTrial(user.id);
  }

  /**
   * Account access request (iOS + Android). This is intentionally an internal
   * administrative request — NOT a purchase or checkout — so the mobile apps
   * stay clear of App Store / Play Store in-app-purchase requirements. The user
   * asks the Ringee team for additional account credit; we email the team and
   * the user. The notification is sent from the Ringee notifications sender; both
   * the requester and the internal inbox are copied so a human can update the
   * account manually.
   */
  @Post("request")
  async requestCredit(
    @CurrentUser() user: CurrentUserData,
    @Body() body: RequestCreditDto,
  ) {
    const fullName =
      body.name?.trim() ||
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      "A Ringee user";
    const requesterEmail = body.email?.trim() || null;
    const workspace = body.workspace?.trim() || "Personal workspace";
    const noteLine = body.note?.trim()
      ? `<p><strong>Note:</strong> ${body.note.trim()}</p>`
      : "";

    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717;">
        <h2 style="margin: 0 0 12px;">New account request</h2>
        <p>${fullName} has requested additional credit on their Ringee account.</p>
        <p><strong>User:</strong> ${fullName}${requesterEmail ? ` (${requesterEmail})` : ""}</p>
        <p><strong>Workspace:</strong> ${workspace}</p>
        <p><strong>User ID:</strong> ${user.id}</p>
        ${noteLine}
        <p style="margin-top: 16px; color: #737373;">
          Reply to this email to follow up with the user and update their account.
        </p>
      </div>
    `;

    const recipients = Array.from(
      new Set(
        [requesterEmail, CREDIT_REQUEST_INTERNAL_CC].filter(
          (e): e is string => !!e,
        ),
      ),
    );

    try {
      await this.email.sendEmail(
        recipients,
        "New account request — Ringee",
        html,
        "Ringee Notifications",
        apiConfiguration.EMAIL_FROM_ADDRESS,
        CREDIT_REQUEST_INTERNAL_CC,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Failed to send account request email for user ${user.id}`,
        error as Error,
      );
      return { success: false };
    }
  }

  @Get("auto-reload-settings")
  @OrgAdminOnly()
  async getAutoReloadSettings(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const settings = await this.creditService.getAutoReloadSettings(ctx);

    return {
      autoReloadEnabled: settings?.autoReloadEnabled ?? false,
      autoReloadThreshold: settings?.autoReloadThreshold ?? 5,
      autoReloadAmount: settings?.autoReloadAmount ?? 25,
      monthlyFundEnabled: settings?.monthlyFundEnabled ?? false,
      monthlyFundAmount: settings?.monthlyFundAmount ?? null,
    };
  }

  @Patch("auto-reload-settings")
  @OrgAdminOnly()
  async updateAutoReloadSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() body: UpdateAutoReloadSettingsDto,
  ) {
    const ctx = createOwnershipContext(user);
    const settings = await this.creditService.updateAutoReloadSettings(
      ctx,
      body,
    );

    return {
      autoReloadEnabled: settings.autoReloadEnabled,
      autoReloadThreshold: settings.autoReloadThreshold,
      autoReloadAmount: settings.autoReloadAmount,
    };
  }

  @Delete("monthly-fund")
  @OrgAdminOnly()
  async cancelMonthlyFund(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    await this.creditService.disableMonthlyFund(ctx);
    return { success: true };
  }
}
