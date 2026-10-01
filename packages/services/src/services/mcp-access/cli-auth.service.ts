import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CliAuthRequest,
  CliAuthRequestRepository,
  Prisma,
} from "@ringee/database";
import {
  RedisService,
  generateCliDeviceCode,
  generateCliUserCode,
  hashOpaqueSecret,
  normalizeCliUserCode,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { OrganizationService } from "../organization.service";
import {
  AgentAccountSummary,
  PersonalApiKeyService,
} from "./personal-api-key.service";

/** How long a `ringee login` code stays valid. */
const REQUEST_TTL_SECONDS = 10 * 60;
/** Poll cadence we ask the CLI to use (RFC 8628 `interval`). */
const POLL_INTERVAL_SECONDS = 2;
/** An approved request must be collected soon after the user approved it. */
const APPROVED_COLLECT_WINDOW_MS = 10 * 60 * 1000;
/** Old requests are only kept for the login funnel in the backoffice. */
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT_MAX_PER_IP = 20;

const FIELD_MAX = 120;

export interface StartCliAuthInput {
  deviceName?: string | null;
  platform?: string | null;
  clientVersion?: string | null;
  ip?: string | null;
}

/** RFC 8628 §3.2 device authorization response (camel-cased). */
export interface StartedCliAuth {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export type CliAuthRequestState =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "used";

export interface CliAuthWorkspaceOption {
  id: string;
  type: "personal" | "organization";
  name: string;
  imageUrl: string | null;
}

/** What the browser approval page shows about a pending terminal. */
export interface CliAuthRequestView {
  userCode: string;
  state: CliAuthRequestState;
  deviceName: string | null;
  platform: string | null;
  clientVersion: string | null;
  requestIp: string | null;
  createdAt: Date;
  expiresAt: Date;
  workspaces: CliAuthWorkspaceOption[];
  activeWorkspaceId: string;
}

/** RFC 8628 §3.5 error codes the CLI understands. */
export type CliAuthPollError =
  | "authorization_pending"
  | "slow_down"
  | "access_denied"
  | "expired_token";

export type CliAuthPollResult =
  | { status: "error"; error: CliAuthPollError }
  | ({
      status: "authorized";
      apiKey: string;
      keyPrefix: string;
    } & AgentAccountSummary);

/**
 * `ringee login`: an OAuth 2.0 device-authorization-grant shaped flow
 * (RFC 8628) that ends in a personal API key.
 *
 * 1. The CLI starts a request and gets a secret device code plus a short user
 *    code; it opens the browser on the verification URL.
 * 2. The signed-in user sees the terminal's details and the user code, checks
 *    it matches the terminal (RFC 8628 §5.4 — the defence against a phished
 *    code), picks the starting workspace and approves.
 * 3. The CLI polls with its device code and collects a freshly minted key,
 *    exactly once.
 *
 * Loopback redirects were considered and rejected: the device shape also works
 * over SSH and in containers, and needs no local port.
 */
@Injectable()
export class CliAuthService {
  constructor(
    private readonly repo: CliAuthRequestRepository,
    private readonly apiKeys: PersonalApiKeyService,
    private readonly organizationService: OrganizationService,
    private readonly redis: RedisService,
  ) {}

  async start(input: StartCliAuthInput): Promise<StartedCliAuth> {
    await this.enforceRateLimit(input.ip);

    const expiresAt = new Date(Date.now() + REQUEST_TTL_SECONDS * 1000);
    const device = generateCliDeviceCode();

    // The user code is short, so a collision with a live one is possible in
    // principle; the unique index catches it and we draw again.
    for (let attempt = 0; ; attempt++) {
      const userCode = generateCliUserCode();
      try {
        await this.repo.create({
          userCode,
          deviceCodeHash: device.hash,
          deviceName: clip(input.deviceName),
          platform: clip(input.platform),
          clientVersion: clip(input.clientVersion),
          requestIp: clip(input.ip),
          expiresAt,
        });
        void this.repo
          .deleteExpiredBefore(new Date(Date.now() - RETENTION_MS))
          .catch(() => undefined);

        const verificationUri = `${frontendBase()}/cli/authorize`;
        return {
          deviceCode: device.plaintext,
          userCode,
          verificationUri,
          verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
          expiresIn: REQUEST_TTL_SECONDS,
          interval: POLL_INTERVAL_SECONDS,
        };
      } catch (err) {
        if (attempt < 3 && isUniqueViolation(err)) continue;
        throw err;
      }
    }
  }

  async getForApproval(
    userId: string,
    rawUserCode: string,
  ): Promise<CliAuthRequestView> {
    const request = await this.findByUserCode(rawUserCode);
    // A request someone else already decided is not this user's business.
    if (request.userId && request.userId !== userId) {
      throw notFound();
    }

    const [memberships, activeOrgId] = await Promise.all([
      this.organizationService.listMembershipsForUser(userId),
      this.organizationService.getActiveWorkspaceOrgId(userId),
    ]);

    return {
      userCode: request.userCode,
      state: stateOf(request),
      deviceName: request.deviceName,
      platform: request.platform,
      clientVersion: request.clientVersion,
      requestIp: request.requestIp,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      workspaces: [
        { id: "personal", type: "personal", name: "Personal", imageUrl: null },
        ...memberships.map((m) => ({
          id: m.id,
          type: "organization" as const,
          name: m.name,
          imageUrl: m.imageUrl,
        })),
      ],
      activeWorkspaceId: activeOrgId ?? "personal",
    };
  }

  /**
   * Approve the terminal and make `workspaceId` the user's active MCP
   * workspace, so the CLI starts where the user said it should.
   */
  async approve(
    userId: string,
    rawUserCode: string,
    workspaceId: string,
  ): Promise<void> {
    const request = await this.findByUserCode(rawUserCode);
    const organizationId = await this.resolveWorkspace(userId, workspaceId);

    const decided = await this.repo.decide(request.id, "approved", userId);
    if (!decided) {
      throw new BadRequestException(
        "This code has expired or was already used. Run `ringee login` again.",
      );
    }
    await this.organizationService.setActiveWorkspace(userId, organizationId);
  }

  async deny(userId: string, rawUserCode: string): Promise<void> {
    const request = await this.findByUserCode(rawUserCode);
    const decided = await this.repo.decide(request.id, "denied", userId);
    if (!decided) {
      throw new BadRequestException(
        "This code has expired or was already used.",
      );
    }
  }

  /** The CLI's poll. Proof of authorization is possession of the device code. */
  async poll(
    deviceCode: string | undefined | null,
  ): Promise<CliAuthPollResult> {
    if (!deviceCode || typeof deviceCode !== "string") {
      throw new BadRequestException("device_code is required");
    }
    const request = await this.repo.findByDeviceCodeHash(
      hashOpaqueSecret(deviceCode),
    );
    if (!request) {
      return { status: "error", error: "expired_token" };
    }

    if (await this.isPollingTooFast(request.id)) {
      return { status: "error", error: "slow_down" };
    }

    switch (stateOf(request)) {
      case "pending":
        return { status: "error", error: "authorization_pending" };
      case "denied":
        return { status: "error", error: "access_denied" };
      case "expired":
      case "used":
        return { status: "error", error: "expired_token" };
      case "approved":
        return this.collect(request);
    }
  }

  private async collect(request: CliAuthRequest): Promise<CliAuthPollResult> {
    const userId = request.userId;
    if (
      !userId ||
      !request.decidedAt ||
      Date.now() - request.decidedAt.getTime() > APPROVED_COLLECT_WINDOW_MS
    ) {
      return { status: "error", error: "expired_token" };
    }

    // A prefix collision rolls the whole transaction back, request included,
    // so drawing a new key and consuming again is safe.
    const { generated, result: key } = await this.apiKeys.mint((draw) =>
      this.repo.consumeWithKey(request.id, {
        userId,
        name: `CLI · ${request.deviceName ?? "terminal"}`.slice(0, 80),
        prefix: draw.prefix,
        keyHash: draw.hash,
      }),
    );
    if (!key) {
      return { status: "error", error: "expired_token" };
    }

    const activeOrgId =
      await this.organizationService.getActiveWorkspaceOrgId(userId);
    return {
      status: "authorized",
      apiKey: generated.plaintext,
      keyPrefix: key.prefix,
      ...(await this.apiKeys.describeAccount(userId, activeOrgId)),
    };
  }

  private async findByUserCode(rawUserCode: string): Promise<CliAuthRequest> {
    const userCode = normalizeCliUserCode(rawUserCode);
    if (!userCode) throw notFound();
    const request = await this.repo.findByUserCode(userCode);
    if (!request) throw notFound();
    return request;
  }

  /** 'personal' → null; an organization only through a real membership. */
  private async resolveWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<string | null> {
    if (!workspaceId || workspaceId === "personal") return null;
    const memberships =
      await this.organizationService.listMembershipsForUser(userId);
    if (!memberships.some((m) => m.id === workspaceId)) {
      throw new ForbiddenException("You are not a member of that workspace");
    }
    return workspaceId;
  }

  private async enforceRateLimit(ip?: string | null): Promise<void> {
    if (!ip) return;
    const count = await this.redis.incrementWithExpiry(
      `ringee:cli-auth:rl:ip:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > RATE_LIMIT_MAX_PER_IP) {
      throw new HttpException(
        "Too many login attempts. Try again in a few minutes.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** RFC 8628 §3.5 `slow_down`: more than one poll per interval. */
  private async isPollingTooFast(requestId: string): Promise<boolean> {
    const polls = await this.redis.incrementWithExpiry(
      `ringee:cli-auth:poll:${requestId}`,
      POLL_INTERVAL_SECONDS,
    );
    return polls > 2;
  }
}

function stateOf(request: CliAuthRequest): CliAuthRequestState {
  switch (request.status) {
    case "pending":
      return request.expiresAt.getTime() <= Date.now() ? "expired" : "pending";
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    case "consumed":
      return "used";
  }
}

function notFound(): NotFoundException {
  return new NotFoundException(
    "This code is invalid or has expired. Run `ringee login` again.",
  );
}

function clip(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v.slice(0, FIELD_MAX) : null;
}

function frontendBase(): string {
  return (apiConfiguration.FRONTEND_URL || "").replace(/\/+$/, "");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}
