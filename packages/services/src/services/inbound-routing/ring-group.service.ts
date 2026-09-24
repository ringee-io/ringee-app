import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InboundDestinationType,
  InboundRouteRepository,
  OrganizationRepository,
  RingGroupRepository,
  type RingGroupWithMembers,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { UserService } from "../user.service";

/** A ring group as the API returns it. */
export interface RingGroupView {
  id: string;
  name: string;
  strategy: string;
  ringSeconds: number;
  createdAt: Date;
  updatedAt: Date;
  members: {
    userId: string;
    name: string | null;
    /** False once the member has left the workspace: they stop ringing. */
    inWorkspace: boolean;
  }[];
}

/**
 * Ring groups: who rings together, and nothing else. Membership is workspace
 * membership — a user who is not in the number's workspace can neither be
 * added here nor, if they leave later, be rung by a group they are still
 * listed in (the resolver drops them on every call).
 */
@Injectable()
export class RingGroupService {
  constructor(
    private readonly repo: RingGroupRepository,
    private readonly routes: InboundRouteRepository,
    private readonly organizations: OrganizationRepository,
    private readonly users: UserService,
  ) {}

  async list(ctx: OwnershipContext): Promise<RingGroupView[]> {
    const groups = await this.repo.listByOwner(ctx);
    return Promise.all(groups.map((group) => this.view(ctx, group)));
  }

  async get(ctx: OwnershipContext, id: string): Promise<RingGroupView> {
    return this.view(ctx, await this.require(ctx, id));
  }

  async create(
    ctx: OwnershipContext,
    input: { name: string; ringSeconds?: number },
  ): Promise<RingGroupView> {
    const group = await this.repo.create(ctx, {
      name: input.name.trim(),
      ringSeconds: input.ringSeconds,
    });
    return this.view(ctx, group);
  }

  async rename(
    ctx: OwnershipContext,
    id: string,
    input: { name?: string; ringSeconds?: number },
  ): Promise<RingGroupView> {
    await this.require(ctx, id);
    const group = await this.repo.update(ctx, id, {
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.ringSeconds === undefined
        ? {}
        : { ringSeconds: input.ringSeconds }),
    });
    if (!group) throw new NotFoundException("Ring group not found.");
    return this.view(ctx, group);
  }

  async addMember(
    ctx: OwnershipContext,
    id: string,
    userId: string,
  ): Promise<RingGroupView> {
    await this.require(ctx, id);
    if (!(await this.isWorkspaceMember(ctx, userId)))
      throw new ForbiddenException(
        "Only a member of this workspace can be added to a ring group.",
      );
    await this.repo.addMember(id, userId);
    return this.view(ctx, await this.require(ctx, id));
  }

  async removeMember(
    ctx: OwnershipContext,
    id: string,
    userId: string,
  ): Promise<RingGroupView> {
    await this.require(ctx, id);
    await this.repo.removeMember(id, userId);
    return this.view(ctx, await this.require(ctx, id));
  }

  /**
   * Deleting a group takes every route that pointed at it with it. A route
   * left pointing at a deleted group would be refused on every call — an
   * outage disguised as configuration — so the number falls back to its
   * default behavior instead.
   */
  async remove(
    ctx: OwnershipContext,
    id: string,
  ): Promise<{ deleted: true; routesReset: number }> {
    await this.require(ctx, id);
    const routesReset = await this.routes.deleteByDestination(
      ctx,
      InboundDestinationType.ring_group,
      id,
    );
    await this.repo.softDelete(ctx, id);
    return { deleted: true, routesReset };
  }

  private async require(
    ctx: OwnershipContext,
    id: string,
  ): Promise<RingGroupWithMembers> {
    const group = await this.repo.findOwnedById(ctx, id);
    // A group in another workspace is indistinguishable from a missing one.
    if (!group) throw new NotFoundException("Ring group not found.");
    return group;
  }

  private async isWorkspaceMember(
    ctx: OwnershipContext,
    userId: string,
  ): Promise<boolean> {
    if (ctx.organizationId)
      return this.organizations.isMember(userId, ctx.organizationId);
    return userId === ctx.userId;
  }

  private async view(
    ctx: OwnershipContext,
    group: RingGroupWithMembers,
  ): Promise<RingGroupView> {
    const members = await Promise.all(
      group.members.map(async (member) => {
        const [user, inWorkspace] = await Promise.all([
          this.users.getCachedUserById(member.userId).catch(() => null),
          this.isWorkspaceMember(ctx, member.userId),
        ]);
        return {
          userId: member.userId,
          name:
            [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
          inWorkspace,
        };
      }),
    );
    return {
      id: group.id,
      name: group.name,
      strategy: group.strategy,
      ringSeconds: group.ringSeconds,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members,
    };
  }
}
