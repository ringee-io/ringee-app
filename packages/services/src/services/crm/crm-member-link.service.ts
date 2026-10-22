import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  CrmConnection,
  CrmMemberLink,
  CrmMemberLinkRepository,
  OrganizationRepository,
  User,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  CrmError,
  CrmProviderRegistry,
  OwnershipContext,
  RedisService,
} from "@ringee/platform";
import type { CrmOwnerRef } from "@ringee/platform";
import { primaryEmailOf } from "../custom-integrations/custom-integration-event-builders";
import { CrmConnectionService } from "./crm-connection.service";

/** How long a connection's CRM users are reused to find a call's owner. */
const CRM_MEMBERS_TTL_MS = 5 * 60 * 1000;

/** A workspace member as the repositories load them, e-mails included. */
type MemberUser = Pick<
  User,
  "id" | "firstName" | "lastName" | "imageUrl" | "profileImageUrl"
> & {
  emails?: Pick<UserEmail, "email" | "isPrimary" | "status">[];
};

/** A workspace member and the CRM user they are on one connection. */
export type CrmMemberLinkEntry = {
  userId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  /** `manual` once an admin chose; `email` while it follows the e-mail match. */
  source: "email" | "manual";
  /**
   * The CRM user what Ringee creates for them is owned by. Null when nobody:
   * no CRM user has their e-mail, or an admin linked them to nobody.
   */
  crmMember: CrmOwnerRef | null;
  /** A manual link to a CRM user the CRM no longer lists. */
  stale: boolean;
  /** The CRM user one of their e-mails matches — what "by e-mail" means. */
  emailMatch: CrmOwnerRef | null;
};

export type CrmMemberLinksView = {
  /**
   * Whether the connection's adapter applies member links. Without it the
   * Team tab only lists the CRM's users, and `members` is empty.
   */
  ownerAssignment: boolean;
  /** False when the CRM's users could not be read just now. */
  crmMembersLoaded: boolean;
  crmMembers: CrmOwnerRef[];
  members: CrmMemberLinkEntry[];
};

/**
 * Which CRM user each workspace member is, per connection — what makes the
 * person a member's first call creates in the CRM, and the call itself,
 * theirs there. A member is linked to the CRM user with one of their
 * e-mails until an admin links them by hand, to another CRM user or to
 * nobody; only that choice is stored.
 */
@Injectable()
export class CrmMemberLinkService {
  private readonly logger = new Logger(CrmMemberLinkService.name);

  constructor(
    private readonly connections: CrmConnectionService,
    private readonly registry: CrmProviderRegistry,
    private readonly links: CrmMemberLinkRepository,
    private readonly organizations: OrganizationRepository,
    private readonly users: UserRepository,
    private readonly redis: RedisService,
  ) {}

  /** The Team tab: every member of the connection's workspace, linked. */
  async list(
    ctx: OwnershipContext,
    connectionId: string,
  ): Promise<CrmMemberLinksView> {
    const connection = await this.loadConnection(ctx, connectionId);
    const ownerAssignment = this.assignsOwners(connection);

    let crmMembers: CrmOwnerRef[] = [];
    let crmMembersLoaded = true;
    try {
      crmMembers = await this.readCrmMembers(connection);
    } catch (err) {
      crmMembersLoaded = false;
      this.logger.warn(
        `could not list CRM users of connection ${connection.id}: ${describeFailure(err)}`,
      );
    }
    if (!ownerAssignment) {
      return { ownerAssignment, crmMembersLoaded, crmMembers, members: [] };
    }

    const [members, links] = await Promise.all([
      this.workspaceMembers(connection),
      this.links.listByConnection(connection.id),
    ]);
    const linkByUser = new Map(links.map((link) => [link.userId, link]));
    return {
      ownerAssignment,
      crmMembersLoaded,
      crmMembers,
      members: members.map((user) =>
        toEntry(
          user,
          linkByUser.get(user.id) ?? null,
          crmMembers,
          crmMembersLoaded,
        ),
      ),
    };
  }

  /**
   * Links a member by hand: to one of the CRM's users, or to nobody (`null`),
   * so nothing Ringee creates for them gets an owner.
   */
  async link(
    ctx: OwnershipContext,
    connectionId: string,
    userId: string,
    crmMemberId: string | null,
  ): Promise<CrmMemberLinkEntry> {
    const connection = await this.loadConnection(ctx, connectionId);
    this.assertAssignsOwners(connection);
    const user = await this.findMember(connection, userId);

    let crmMember: CrmOwnerRef | null = null;
    let crmMembers: CrmOwnerRef[] = [];
    if (crmMemberId !== null) {
      // Read fresh: the id must name a user the CRM has now.
      try {
        crmMembers = await this.readCrmMembers(connection);
      } catch (err) {
        throw new ServiceUnavailableException(
          `could not read the ${connection.provider} users: ${describeFailure(err)}`,
        );
      }
      crmMember =
        crmMembers.find((member) => member.externalId === crmMemberId) ?? null;
      if (!crmMember) {
        throw new BadRequestException(
          `no ${connection.provider} user ${crmMemberId} on this connection`,
        );
      }
    } else {
      // Nobody needs no CRM user: the list only finds the entry's e-mail
      // match, which a CRM that cannot be read just leaves out.
      crmMembers = await this.cachedCrmMembers(connection).catch(() => []);
    }

    const link = await this.links.upsert({
      connectionId: connection.id,
      userId: user.id,
      provider: connection.provider,
      externalMemberId: crmMember?.externalId ?? null,
      externalMemberEmail: crmMember?.email ?? null,
      externalMemberName: crmMember?.name ?? null,
    });
    return toEntry(user, link, crmMembers, true);
  }

  /** Puts a member back on the e-mail match. */
  async unlink(
    ctx: OwnershipContext,
    connectionId: string,
    userId: string,
  ): Promise<CrmMemberLinkEntry> {
    const connection = await this.loadConnection(ctx, connectionId);
    this.assertAssignsOwners(connection);
    const user = await this.findMember(connection, userId);
    await this.links.remove(connection.id, user.id);

    let crmMembers: CrmOwnerRef[] = [];
    let crmMembersLoaded = true;
    try {
      crmMembers = await this.cachedCrmMembers(connection);
    } catch {
      crmMembersLoaded = false;
    }
    return toEntry(user, null, crmMembers, crmMembersLoaded);
  }

  /**
   * The CRM user a record Ringee creates for `userId` on this connection is
   * owned by, or null for none. Never fails: a CRM that cannot be read just
   * now costs the record its owner, not the record.
   */
  async resolveCrmMemberId(
    connection: CrmConnection,
    userId: string | null | undefined,
  ): Promise<string | null> {
    if (!userId || !this.assignsOwners(connection)) return null;
    try {
      const link = await this.links.find(connection.id, userId);
      if (link) return link.externalMemberId;
      const user = await this.users.findById(userId);
      if (!user) return null;
      const crmMembers = await this.cachedCrmMembers(connection);
      return matchByEmail(user, crmMembers)?.externalId ?? null;
    } catch (err) {
      this.logger.warn(
        `no CRM owner for user ${userId} on connection ${connection.id}: ${describeFailure(err)}`,
      );
      return null;
    }
  }

  private assignsOwners(connection: CrmConnection): boolean {
    return (
      this.registry.tryGet(connection.provider)?.capabilities
        .supportsOwnerAssignment === true
    );
  }

  private assertAssignsOwners(connection: CrmConnection): void {
    if (!this.assignsOwners(connection)) {
      throw new BadRequestException(
        `${connection.provider} connections do not assign owners yet`,
      );
    }
  }

  private async loadConnection(
    ctx: OwnershipContext,
    connectionId: string,
  ): Promise<CrmConnection> {
    const connection = await this.connections.findById(connectionId);
    if (!connection) throw new NotFoundException("connection not found");
    await this.connections.assertAccess(ctx, connection);
    return connection;
  }

  /**
   * A member of the connection's workspace — the organization's members, or
   * the one user a personal connection belongs to. Anyone else is not found.
   */
  private async findMember(
    connection: CrmConnection,
    userId: string,
  ): Promise<MemberUser> {
    const belongs =
      connection.scope === "organization"
        ? connection.organizationId !== null &&
          (await this.organizations.isMember(userId, connection.organizationId))
        : userId === connection.userId;
    const user = belongs ? await this.users.findById(userId) : null;
    if (!user) throw new NotFoundException("member not found");
    return user;
  }

  private async workspaceMembers(
    connection: CrmConnection,
  ): Promise<MemberUser[]> {
    if (connection.scope !== "organization") {
      const owner = await this.users.findById(connection.userId);
      return owner ? [owner] : [];
    }
    if (!connection.organizationId) return [];
    const members = await this.organizations.findMembersWithEmails(
      connection.organizationId,
    );
    return members.sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: "base" }),
    );
  }

  /** The CRM's users as they are now; also refreshes the cached copy. */
  private async readCrmMembers(
    connection: CrmConnection,
  ): Promise<CrmOwnerRef[]> {
    const members = await this.connections.listMembers(connection);
    await this.redis
      .set(cacheKey(connection), members, CRM_MEMBERS_TTL_MS)
      .catch(() => undefined);
    return members;
  }

  /**
   * The CRM's users, from the cache when it is recent. A call that needs an
   * owner should not cost a provider round trip each time.
   */
  private async cachedCrmMembers(
    connection: CrmConnection,
  ): Promise<CrmOwnerRef[]> {
    const cached = await this.redis
      .get<CrmOwnerRef[]>(cacheKey(connection))
      .catch(() => undefined);
    return Array.isArray(cached) ? cached : this.readCrmMembers(connection);
  }
}

function cacheKey(connection: CrmConnection): string {
  return `crm-members-${connection.id}`;
}

function toEntry(
  user: MemberUser,
  link: CrmMemberLink | null,
  crmMembers: CrmOwnerRef[],
  crmMembersLoaded: boolean,
): CrmMemberLinkEntry {
  const emailMatch = matchByEmail(user, crmMembers);
  const base = {
    userId: user.id,
    name: displayName(user),
    email: primaryEmailOf(user) ?? null,
    imageUrl: user.imageUrl ?? user.profileImageUrl ?? null,
    emailMatch,
  };
  if (!link) {
    return { ...base, source: "email", crmMember: emailMatch, stale: false };
  }
  if (!link.externalMemberId) {
    return { ...base, source: "manual", crmMember: null, stale: false };
  }
  const current = crmMembers.find(
    (member) => member.externalId === link.externalMemberId,
  );
  return {
    ...base,
    source: "manual",
    crmMember: current ?? {
      externalId: link.externalMemberId,
      email: link.externalMemberEmail,
      name: link.externalMemberName,
    },
    stale: !current && crmMembersLoaded,
  };
}

/**
 * The CRM user with one of the member's e-mails, primary first. Only an
 * address the member proved is theirs counts: their primary one, or one
 * their identity provider verified.
 */
function matchByEmail(
  user: MemberUser,
  crmMembers: CrmOwnerRef[],
): CrmOwnerRef | null {
  const emails = [...(user.emails ?? [])]
    .filter((email) => email.isPrimary || email.status === "verified")
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((email) => normalizeEmail(email.email));
  for (const email of emails) {
    const match = crmMembers.find(
      (member) => member.email && normalizeEmail(member.email) === email,
    );
    if (match) return match;
  }
  return null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function displayName(user: MemberUser): string | null {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null
  );
}

function sortKey(user: MemberUser): string {
  return displayName(user) ?? primaryEmailOf(user) ?? user.id;
}

/** A failure's code, never its payload — payloads carry personal data. */
function describeFailure(err: unknown): string {
  if (err instanceof CrmError) return err.code;
  return err instanceof Error ? err.message : "unexpected error";
}
