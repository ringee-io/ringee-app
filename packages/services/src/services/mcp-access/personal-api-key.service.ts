import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  PersonalApiKey,
  PersonalApiKeyRepository,
  PersonalApiKeySource,
  Prisma,
  User,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  GeneratedPersonalApiKey,
  OwnershipContext,
  generatePersonalApiKey,
  hashOpaqueSecret,
  isPersonalApiKeyShape,
} from "@ringee/platform";
import { OrganizationService } from "../organization.service";
import { primaryEmailOf } from "../custom-integrations/custom-integration-event-builders";

/** A key as the owner sees it — never the secret, only its prefix. */
export interface PersonalApiKeyView {
  id: string;
  name: string;
  prefix: string;
  source: PersonalApiKeySource;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastClientName: string | null;
  lastClientVersion: string | null;
}

export interface CreatedPersonalApiKey extends PersonalApiKeyView {
  /** The full key. Returned exactly once, at creation. */
  key: string;
}

export interface ResolvedPersonalApiKey {
  apiKey: PersonalApiKey;
  user: User;
  ctx: OwnershipContext;
}

export interface McpClientInfo {
  name: string;
  version: string | null;
}

/** Who a key acts as and where — what `ringee whoami` and login print. */
export interface AgentAccountSummary {
  user: { email: string | null; name: string | null };
  workspace: { id: string; type: "personal" | "organization"; name: string };
}

const MAX_ACTIVE_KEYS_PER_USER = 50;
/** Draws allowed when a new key's display prefix is already taken. */
const MAX_MINT_ATTEMPTS = 3;
const MAX_NAME_LENGTH = 80;
/** `lastUsedAt` is a hint, not an audit trail: write it at most once a minute. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Personal API keys for the agent surfaces (MCP endpoint and `ringee` CLI).
 *
 * A key proves WHO is calling. It is not pinned to a workspace: requests run in
 * the user's active MCP workspace (`OrganizationService.getActiveWorkspaceOrgId`,
 * changed by `switch_workspace`), with membership re-validated on every
 * request — the same rule the ChatGPT OAuth connector follows.
 */
@Injectable()
export class PersonalApiKeyService {
  private readonly logger = new Logger(PersonalApiKeyService.name);

  constructor(
    private readonly repo: PersonalApiKeyRepository,
    private readonly userRepository: UserRepository,
    private readonly organizationService: OrganizationService,
  ) {}

  async list(userId: string): Promise<PersonalApiKeyView[]> {
    const keys = await this.repo.listActiveForUser(userId);
    return keys.map(toView);
  }

  async create(
    userId: string,
    rawName: string | undefined,
    source: PersonalApiKeySource = "dashboard",
  ): Promise<CreatedPersonalApiKey> {
    const name = normalizeKeyName(rawName);
    const active = await this.repo.listActiveForUser(userId);
    if (active.length >= MAX_ACTIVE_KEYS_PER_USER) {
      throw new BadRequestException(
        `You can have up to ${MAX_ACTIVE_KEYS_PER_USER} active API keys. Revoke one you no longer use first.`,
      );
    }

    const { generated, result: created } = await this.mint((key) =>
      this.repo.create({
        userId,
        name,
        source,
        prefix: key.prefix,
        keyHash: key.hash,
      }),
    );
    return { ...toView(created), key: generated.plaintext };
  }

  /**
   * Generate a key and hand it to `persist`. The displayed prefix is only 32
   * bits and unique, so it can collide once many keys exist; when the insert
   * fails on that index we draw a fresh key. Any other error propagates.
   */
  async mint<T>(
    persist: (key: GeneratedPersonalApiKey) => Promise<T>,
  ): Promise<{ generated: GeneratedPersonalApiKey; result: T }> {
    for (let attempt = 1; ; attempt++) {
      const generated = generatePersonalApiKey();
      try {
        return { generated, result: await persist(generated) };
      } catch (err) {
        if (attempt < MAX_MINT_ATTEMPTS && isKeyCollision(err)) continue;
        throw err;
      }
    }
  }

  async revoke(userId: string, id: string): Promise<void> {
    const revoked = await this.repo.revokeForUser(userId, id);
    if (!revoked) {
      throw new NotFoundException("API key not found");
    }
  }

  /**
   * Resolve a bearer key to its user and the workspace the request runs in.
   * Fails closed: unknown, revoked, or a blocked account (WRK-007).
   */
  async authenticate(
    rawKey: string | undefined | null,
  ): Promise<ResolvedPersonalApiKey> {
    if (!isPersonalApiKeyShape(rawKey)) {
      throw new UnauthorizedException("Invalid API key");
    }
    const apiKey = await this.repo.findByHash(hashOpaqueSecret(rawKey));
    if (!apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }
    if (apiKey.revokedAt) {
      throw new UnauthorizedException(
        "This API key has been revoked. Create a new one or run `ringee login`.",
      );
    }
    if (apiKey.user.blockedAt) {
      throw new ForbiddenException("Account disabled");
    }

    const organizationId =
      await this.organizationService.getActiveWorkspaceOrgId(apiKey.userId);

    if (
      !apiKey.lastUsedAt ||
      Date.now() - apiKey.lastUsedAt.getTime() > TOUCH_INTERVAL_MS
    ) {
      this.touch(apiKey.id);
    }

    return {
      apiKey,
      user: apiKey.user,
      ctx: { userId: apiKey.userId, organizationId },
    };
  }

  async describeAccount(
    userId: string,
    organizationId: string | null,
  ): Promise<AgentAccountSummary> {
    const [user, memberships] = await Promise.all([
      this.userRepository.findById(userId) as Promise<
        (User & { emails?: UserEmail[] }) | null
      >,
      organizationId
        ? this.organizationService.listMembershipsForUser(userId)
        : Promise.resolve([]),
    ]);
    const org = organizationId
      ? memberships.find((m) => m.id === organizationId)
      : undefined;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    return {
      user: { email: primaryEmailOf(user) ?? null, name: name || null },
      workspace: org
        ? { id: org.id, type: "organization", name: org.name }
        : { id: "personal", type: "personal", name: "Personal" },
    };
  }

  /** Remember which MCP client last used the key (from `initialize`). */
  recordClient(apiKeyId: string, client: McpClientInfo): void {
    this.touch(apiKeyId, client);
  }

  private touch(id: string, client?: McpClientInfo): void {
    void this.repo.touch(id, client).catch((err: Error) => {
      this.logger.warn(`Could not touch API key ${id}: ${err.message}`);
    });
  }
}

function toView(key: PersonalApiKey): PersonalApiKeyView {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    source: key.source,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    lastClientName: key.lastClientName,
    lastClientVersion: key.lastClientVersion,
  };
}

/** A unique violation on the key's own columns — never on anything else. */
function isKeyCollision(err: unknown): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== "P2002"
  ) {
    return false;
  }
  const target = JSON.stringify(err.meta?.target ?? "");
  return target.includes("prefix") || target.includes("keyHash");
}

function normalizeKeyName(raw: string | undefined): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) {
    throw new BadRequestException("Give the API key a name");
  }
  return name.slice(0, MAX_NAME_LENGTH);
}
