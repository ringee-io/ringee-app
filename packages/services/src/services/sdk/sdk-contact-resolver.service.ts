import { Injectable } from "@nestjs/common";
import {
  ContactRepository,
  CustomIntegrationContactLinkRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

/**
 * Resolves the Ringee `Contact` a call should attach to, without ever creating
 * one (MVP rule §15). Resolution order:
 *   1. an explicit `contactId` — only when it belongs to the agent's workspace;
 *   2. an `externalContactId` — mapped through `CustomIntegrationContactLink`;
 *   3. otherwise `null` (the call is still allowed and lands unlinked).
 */
@Injectable()
export class SdkContactResolver {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly links: CustomIntegrationContactLinkRepository,
  ) {}

  async resolve(
    ctx: OwnershipContext,
    integrationId: string,
    input: { contactId?: string | null; externalContactId?: string | null },
  ): Promise<string | null> {
    if (input.contactId) {
      const contact = await this.contacts
        .findById(input.contactId)
        .catch(() => null);
      if (contact && this.ownsContact(contact, ctx)) {
        return contact.id;
      }
      // A contactId the agent doesn't own is ignored (fall through), never
      // trusted — the call proceeds unlinked rather than leaking another
      // workspace's contact.
      return null;
    }

    if (input.externalContactId) {
      const link = await this.links
        .findByExternalId(integrationId, input.externalContactId)
        .catch(() => null);
      if (link?.contactId) return link.contactId;
    }

    return null;
  }

  private ownsContact(
    contact: { userId?: string | null; organizationId?: string | null },
    ctx: OwnershipContext,
  ): boolean {
    if (ctx.organizationId) {
      return contact.organizationId === ctx.organizationId;
    }
    return (
      contact.userId === ctx.userId &&
      (contact.organizationId === null || contact.organizationId === undefined)
    );
  }
}
