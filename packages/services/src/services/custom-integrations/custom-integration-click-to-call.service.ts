import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  CustomIntegration,
  CustomIntegrationContactLinkRepository,
  ContactRepository,
  PrismaService,
} from "@ringee/database";
import { CryptoService, OwnershipContext } from "@ringee/platform";

export interface ClickToCallInput {
  contactExternalId?: string;
  phoneNumber?: string;
  fromNumber?: string;
  agentEmail?: string;
  ownerEmail?: string;
  ownerExternalId?: string;
}

export interface ClickToCallResult {
  contactId: string | null;
  agentUserId: string;
  toNumber: string;
  fromNumber: string;
  dialerUrl: string;
  sessionToken: string;
  expiresAt: string;
}

@Injectable()
export class CustomIntegrationClickToCallService {
  private readonly logger = new Logger(
    CustomIntegrationClickToCallService.name,
  );

  constructor(
    private readonly contactLinkRepo: CustomIntegrationContactLinkRepository,
    private readonly contactRepo: ContactRepository,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async execute(
    integration: CustomIntegration,
    input: ClickToCallInput,
  ): Promise<ClickToCallResult> {
    const ctx: OwnershipContext = {
      userId: integration.userId,
      organizationId: integration.organizationId,
    };

    // 1) Resolve contact (optional) + destination number.
    let contactId: string | null = null;
    let toNumber: string | null = input.phoneNumber
      ? normalizePhone(input.phoneNumber)
      : null;

    if (input.contactExternalId) {
      const link = await this.contactLinkRepo.findByExternalId(
        integration.id,
        input.contactExternalId,
      );
      if (link?.contactId) {
        const contact = await this.contactRepo.findById(link.contactId);
        if (contact) {
          contactId = contact.id;
          toNumber = toNumber ?? contact.phoneNumber;
        }
      }
    }

    if (!toNumber) {
      throw new BadRequestException(
        "Must provide either contactExternalId (linked to a contact) or phoneNumber",
      );
    }

    // 2) Resolve agent.
    const agentUserId = await this.resolveAgent(ctx, input);

    // 3) Resolve fromNumber.
    const fromNumber = await this.resolveFromNumber(
      ctx,
      agentUserId,
      input.fromNumber,
    );

    // 4) Build a signed dialer session — the agent's browser picks it up and
    // initiates the WebRTC leg (same pattern as Attio click-to-call).
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = {
      v: 1,
      type: "custom_integration_call_session",
      integrationId: integration.id,
      userId: agentUserId,
      organizationId: integration.organizationId,
      contactId,
      toNumber,
      fromNumber,
      createdAt: Date.now(),
      expiresAt,
    };
    const sessionToken = this.crypto.encrypt(
      payload as unknown as Record<string, unknown>,
    );

    const frontendUrl =
      (apiConfiguration.FRONTEND_URL as string | undefined) ??
      "http://localhost:4200";
    const qs = new URLSearchParams({
      session: sessionToken,
      to: toNumber,
      from: fromNumber,
    });

    return {
      contactId,
      agentUserId,
      toNumber,
      fromNumber,
      dialerUrl: `${frontendUrl}/dashboard/dialer?${qs.toString()}`,
      sessionToken,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private async resolveAgent(
    ctx: OwnershipContext,
    input: ClickToCallInput,
  ): Promise<string> {
    // Freelancer workspace: always the workspace owner.
    if (!ctx.organizationId) return ctx.userId;

    // Organization workspace: prefer explicit agent identification from payload.
    const email = (input.agentEmail ?? input.ownerEmail)?.toLowerCase().trim();
    if (email) {
      const member = await this.prisma.organizationMembership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          user: { emails: { some: { email } } },
        },
      });
      if (!member?.userId) {
        throw new UnprocessableEntityException(
          `No member of this organization has email "${email}"`,
        );
      }
      return member.userId;
    }

    if (input.ownerExternalId) {
      throw new UnprocessableEntityException(
        "ownerExternalId resolution is not configured. Provide agentEmail instead.",
      );
    }

    throw new UnprocessableEntityException(
      "Organization workspaces must specify agentEmail to resolve which user places the call.",
    );
  }

  private async resolveFromNumber(
    ctx: OwnershipContext,
    agentUserId: string,
    requested: string | undefined,
  ): Promise<string> {
    if (requested) return normalizePhone(requested);

    // Pick the first active verified caller ID for the agent in this workspace.
    const callerId = await this.prisma.numberPurchased.findFirst({
      where: {
        userId: agentUserId,
        ...(ctx.organizationId
          ? { organizationId: ctx.organizationId }
          : { organizationId: null }),
        kind: "verified_caller_id",
        verified: true,
        active: true,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
    if (callerId) return callerId.phoneNumber;

    // Fall back to any purchased number on the workspace.
    const purchased = await this.prisma.numberPurchased.findFirst({
      where: {
        ...(ctx.organizationId
          ? { organizationId: ctx.organizationId }
          : { userId: agentUserId, organizationId: null }),
        kind: "purchased",
      },
      orderBy: { createdAt: "asc" },
    });
    if (purchased) return purchased.phoneNumber;

    throw new UnprocessableEntityException(
      "No caller ID or purchased number is available for this workspace.",
    );
  }
}

function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}
