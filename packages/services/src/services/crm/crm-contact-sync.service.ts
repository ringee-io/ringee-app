import { Injectable, Logger } from "@nestjs/common";
import {
  CrmConnection,
  CrmContactLinkRepository,
  ContactPhoneRepository,
  ContactEmailRepository,
  ContactRepository,
  Prisma,
} from "@ringee/database";
import {
  CrmProviderRegistry,
  CrmContactSyncResult,
  normalizePhoneE164,
  OwnershipContext,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

@Injectable()
export class CrmContactSyncService {
  private readonly logger = new Logger(CrmContactSyncService.name);

  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly connections: CrmConnectionService,
    private readonly linkRepo: CrmContactLinkRepository,
    private readonly contactRepo: ContactRepository,
    private readonly phoneRepo: ContactPhoneRepository,
    private readonly emailRepo: ContactEmailRepository,
  ) {}

  async syncFromCrm(
    connection: CrmConnection,
    externalId: string,
    ctx: OwnershipContext,
  ): Promise<{ contactId: string; created: boolean }> {
    const provider = this.registry.get(connection.provider);
    if (!provider.fetchPerson) {
      throw new Error(`${connection.provider} does not support fetchPerson`);
    }

    const decrypted = await this.connections.getValidCredentials(connection);
    const creds = {
      accessToken: decrypted.accessToken,
      refreshToken: decrypted.refreshToken,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
    };

    const result = await provider.fetchPerson(creds, externalId);
    return this.upsertContact(connection, result, ctx);
  }

  async upsertContact(
    connection: CrmConnection,
    result: CrmContactSyncResult,
    ctx: OwnershipContext,
  ): Promise<{ contactId: string; created: boolean }> {
    const primaryPhone = result.phones[0];
    const primaryEmail = result.emails[0];

    const existingLink = await this.linkRepo.findByExternalId(
      connection.id,
      "person",
      result.contact.externalId,
    );

    if (existingLink?.contactId) {
      await this.updateExistingContact(existingLink.contactId, result);
      await this.syncPhones(existingLink.contactId, result.phones);
      await this.syncEmails(existingLink.contactId, result.emails);
      await this.linkRepo.upsertLink({
        connectionId: connection.id,
        provider: connection.provider,
        externalId: result.contact.externalId,
        externalType: "person",
        phoneNumberE164: primaryPhone ?? null,
        contactId: existingLink.contactId,
        matchConfidence: "crm_sync",
        rawSnapshot: (result.raw ?? null) as Record<string, unknown> | null,
      });
      return { contactId: existingLink.contactId, created: false };
    }

    const existingByPhone = primaryPhone
      ? await this.contactRepo.findByPhone(ctx, primaryPhone)
      : null;

    const existingContactId = existingByPhone?.id
      ?? (primaryEmail ? (await this.findContactByEmail(ctx, primaryEmail))?.id : null);

    if (existingContactId) {
      await this.updateExistingContact(existingContactId, result);
      await this.syncPhones(existingContactId, result.phones);
      await this.syncEmails(existingContactId, result.emails);
      await this.linkRepo.upsertLink({
        connectionId: connection.id,
        provider: connection.provider,
        externalId: result.contact.externalId,
        externalType: "person",
        phoneNumberE164: primaryPhone ?? null,
        contactId: existingContactId,
        matchConfidence: primaryPhone ? "phone_exact" : "email_exact",
        rawSnapshot: (result.raw ?? null) as Record<string, unknown> | null,
      });
      return { contactId: existingContactId, created: false };
    }

    const contact = await this.contactRepo.create(ctx, {
      name: result.displayName ?? undefined,
      firstName: result.firstName ?? undefined,
      lastName: result.lastName ?? undefined,
      phoneNumber: primaryPhone ?? "unknown",
      email: primaryEmail ?? undefined,
      jobTitle: result.jobTitle ?? undefined,
      source: `crm:${connection.provider}`,
      crmMetadata: { lastSyncedFrom: connection.provider, externalId: result.contact.externalId } as unknown as Prisma.InputJsonValue,
    });

    await this.syncPhones(contact.id, result.phones);
    await this.syncEmails(contact.id, result.emails);

    await this.linkRepo.upsertLink({
      connectionId: connection.id,
      provider: connection.provider,
      externalId: result.contact.externalId,
      externalType: "person",
      phoneNumberE164: primaryPhone ?? null,
      contactId: contact.id,
      matchConfidence: "crm_sync",
      rawSnapshot: (result.raw ?? null) as Record<string, unknown> | null,
    });

    return { contactId: contact.id, created: true };
  }

  private async updateExistingContact(
    contactId: string,
    result: CrmContactSyncResult,
  ): Promise<void> {
    const updates: Prisma.ContactUpdateInput = {};
    if (result.displayName) updates.name = result.displayName;
    if (result.firstName) updates.firstName = result.firstName;
    if (result.lastName) updates.lastName = result.lastName;
    if (result.jobTitle) updates.jobTitle = result.jobTitle;
    if (result.emails[0]) updates.email = result.emails[0];

    if (Object.keys(updates).length > 0) {
      await this.contactRepo.update(contactId, updates);
    }
  }

  private async syncPhones(contactId: string, phones: string[]): Promise<void> {
    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i];
      const e164 = normalizePhoneE164(phone);
      await this.phoneRepo.upsert({
        contactId,
        phone,
        phoneE164: e164,
        isPrimary: i === 0,
      });
    }
  }

  private async syncEmails(contactId: string, emails: string[]): Promise<void> {
    for (let i = 0; i < emails.length; i++) {
      await this.emailRepo.upsert({
        contactId,
        email: emails[i],
        isPrimary: i === 0,
      });
    }
  }

  private async findContactByEmail(
    ctx: OwnershipContext,
    email: string,
  ): Promise<{ id: string } | null> {
    const emailRecords = await this.emailRepo.findByEmail(email);
    if (emailRecords.length === 0) return null;
    for (const rec of emailRecords) {
      const contact = await this.contactRepo.findById(rec.contactId);
      if (!contact || contact.deletedAt) continue;
      const matchesCtx = ctx.organizationId
        ? contact.organizationId === ctx.organizationId
        : contact.userId === ctx.userId && !contact.organizationId;
      if (matchesCtx) return { id: contact.id };
    }
    return null;
  }
}
