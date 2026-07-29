import { Controller, Post, Req, Res, HttpStatus } from "@nestjs/common";
import type { Request as ExpressRequest, Response } from "express";
import { verifyWebhook, type WebhookEvent } from "@clerk/backend/webhooks";
import {
  ClerkUserRepository,
  ClerkOrganizationRepository,
  Public,
} from "@ringee/platform";
import { UserRepository, OrganizationRepository } from "@ringee/database";
import { SubscriptionService, UserService } from "@ringee/services";
import { apiConfiguration } from "@ringee/configuration";
import { TriggerLoopEventPublisher } from "../../triggerloop/services/triggerloop-event-publisher.service";
import { UserAccessEnforcementService } from "./user-access-enforcement.service";

@Public()
@Controller("webhooks")
export class ClerkController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly subscriptionService: SubscriptionService,
    private readonly userService: UserService,
    private readonly triggerLoop: TriggerLoopEventPublisher,
    private readonly userAccess: UserAccessEnforcementService,
  ) {}

  @Post("clerk")
  async handle(@Req() req: ExpressRequest, @Res() res: Response) {
    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(HttpStatus.BAD_REQUEST).send("Missing Svix headers");
    }

    try {
      const fetchReq = new Request(
        `${apiConfiguration.BACKEND_URL}/api/webhooks/clerk`,
        {
          method: "POST",
          headers: {
            "content-type": req.headers["content-type"] as string,
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
          } as Record<string, string>,
          body:
            req.body instanceof Buffer
              ? req.body
              : Buffer.from(JSON.stringify(req.body)),
        },
      );

      const evt: WebhookEvent = await verifyWebhook(fetchReq, {
        signingSecret: apiConfiguration.CLERK_WEBHOOK_SIGNING_SECRET,
      });

      const ip = evt.event_attributes?.http_request?.client_ip;
      const userAgent = evt.event_attributes?.http_request?.user_agent;

      switch (evt.type) {
        case "user.created": {
          const userId = (evt.data as any).id;
          const clerkUser = await ClerkUserRepository.findById(userId);
          const user = await this.userRepository.syncFromClerkUser(clerkUser, {
            clientIp: ip,
            userAgent: userAgent,
          });
          await this.userService.invalidateUserCache(user);

          await ClerkUserRepository.updateMetadata(userId, {
            privateMetadata: {
              ...(clerkUser.privateMetadata as Record<string, unknown>),
              userId: user.id,
            },
          });

          await this.triggerLoop.startWorkflow("signupFollowup", {
            type: "user",
            id: user.id,
          });
          break;
        }

        case "user.updated": {
          const ip = evt.event_attributes?.http_request?.client_ip;
          const userAgent = evt.event_attributes?.http_request?.user_agent;
          const userId = (evt.data as any).id;

          const clerkUser = await ClerkUserRepository.findById(userId);
          // `user.updated` can overtake `user.created` during signup. Use the
          // idempotent sync path so either event can establish the local row.
          const user = await this.userRepository.syncFromClerkUser(clerkUser, {
            clientIp: ip,
            userAgent: userAgent,
          });
          await this.userService.invalidateUserCache(user);

          await this.userAccess.syncClerkAccessToRingee(
            user.id,
            clerkUser.banned,
          );

          const primary = clerkUser.emailAddresses?.find(
            (e) => e.id === clerkUser.primaryEmailAddressId,
          );
          if (primary?.verification?.status === "verified" && user?.id) {
            await this.triggerLoop.emailVerified(user.id, primary.emailAddress);
          }
          break;
        }

        case "user.deleted": {
          const userId = (evt.data as any).id;
          const deleted = await this.userRepository.deleteByClerkId(userId);
          await this.userService.invalidateUserCache(deleted);
          break;
        }

        case "organization.created": {
          const orgId = (evt.data as any).id;
          const createdBy = (evt.data as any).created_by;

          const clerkOrg = await ClerkOrganizationRepository.findById(orgId);
          const org =
            await this.organizationRepository.syncFromClerkOrganization(
              clerkOrg,
            );

          // Find user's unassigned subscription and assign it to this org
          if (createdBy) {
            const user = await this.userRepository.findByClerkId(createdBy);
            if (user) {
              await this.subscriptionService.assignToOrganization(
                user.id,
                org.id,
              );
              await this.triggerLoop.workspaceCreated(user.id, org.id);
            }
          }
          break;
        }

        case "organization.updated": {
          const orgId = (evt.data as any).id;
          const clerkOrg = await ClerkOrganizationRepository.findById(orgId);
          await this.organizationRepository.updateFromClerkOrganization(
            clerkOrg,
          );
          break;
        }

        case "organization.deleted": {
          const orgId = (evt.data as any).id;
          await this.organizationRepository.deleteByClerkId(orgId);
          break;
        }

        case "organizationMembership.created": {
          const membership = evt.data as any;

          // Sincronizar organización (upsert maneja si existe o no)
          const clerkOrg = await ClerkOrganizationRepository.findById(
            membership.organization.id,
          );
          await this.organizationRepository.syncFromClerkOrganization(clerkOrg);

          // Sincronizar usuario si existe en Clerk (upsert maneja si existe o no)
          try {
            const clerkUser = await ClerkUserRepository.findById(
              membership.public_user_data.user_id,
            );
            const syncedMember = await this.userRepository.syncFromClerkUser(
              clerkUser,
              {
                clientIp: ip,
                userAgent: userAgent,
              },
            );
            await this.userService.invalidateUserCache(syncedMember);
          } catch (error) {
            // Usuario aún no existe (invitación pendiente), continuar sin error
            console.log(
              `User ${membership.public_user_data.user_id} not found in Clerk - pending invitation`,
            );
          }

          // Crear la membresía
          await this.organizationRepository.addMembership(
            membership.organization.id,
            membership.public_user_data.user_id,
            membership.role,
          );
          break;
        }

        case "organizationMembership.deleted": {
          const membership = evt.data as any;
          await this.organizationRepository.removeMembership(
            membership.organization.id,
            membership.public_user_data.user_id,
          );
          break;
        }

        default:
          // otros eventos
          break;
      }

      return res.status(HttpStatus.NO_CONTENT).send();
    } catch (err: any) {
      console.error("❌ Clerk webhook verification failed:", err);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send("Invalid signature or malformed webhook");
    }
  }
}
