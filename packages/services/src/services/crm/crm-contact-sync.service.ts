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

/** A provider phone number that normalized cleanly, with its original form. */
type DialablePhone = { raw: string; e164: string };

/**
 * Result of pulling one CRM person into Ringee. `contactId` is null when the
 * person carried no dialable phone number and no existing contact matched —
 * see {@link CrmContactSyncService.upsertContact}.
 */
export type CrmContactUpsertResult = {
  contactId: string | null;
  created: boolean;
  /** Set when no contact row was written, with the reason. */
  skipped?: "no_phone";
};

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
  ): Promise<CrmContactUpsertResult> {
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
  ): Promise<CrmContactUpsertResult> {
    // Only dialable numbers are allowed into Contact.phoneNumber. Providers
    // hand back whatever the CRM holds (blank, "n/a", extensions), and that
    // column is what the dialer and inbound call matching key on.
    const phones = this.dialablePhones(result.phones);
    const primaryPhone = phones[0]?.e164 ?? null;
    const primaryEmail = result.emails[0];

    const existingLink = await this.linkRepo.findByExternalId(
      connection.id,
      "person",
      result.contact.externalId,
    );

    if (existingLink?.contactId) {
      await this.updateExistingContact(
        existingLink.contactId,
        result,
        primaryPhone,
      );
      await this.syncPhones(existingLink.contactId, phones);
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

    const existingContactId =
      existingByPhone?.id ??
      (primaryEmail
        ? (
            await this.findContactByEmail(
              ctx,
              primaryEmail,
              connection,
              result.contact.externalId,
            )
          )?.id
        : null);

    if (existingContactId) {
      await this.updateExistingContact(existingContactId, result, primaryPhone);
      await this.syncPhones(existingContactId, phones);
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

    // No dialable number and nothing already in the directory to enrich: do
    // NOT invent one. A placeholder here ("unknown") produces an uncallable
    // row that can never match an inbound call event, and thousands of them
    // bury the real contacts in search. The person stays in the CRM; once it
    // gains a phone number the next sync pass creates it for real.
    if (!primaryPhone) {
      this.logger.debug(
        `skipping ${connection.provider} person ${result.contact.externalId}: no dialable phone number`,
      );
      return { contactId: null, created: false, skipped: "no_phone" };
    }

    const contact = await this.contactRepo.create(ctx, {
      name: result.displayName ?? undefined,
      firstName: result.firstName ?? undefined,
      lastName: result.lastName ?? undefined,
      phoneNumber: primaryPhone,
      email: primaryEmail ?? undefined,
      jobTitle: result.jobTitle ?? undefined,
      source: `crm:${connection.provider}`,
      crmMetadata: {
        lastSyncedFrom: connection.provider,
        externalId: result.contact.externalId,
      } as unknown as Prisma.InputJsonValue,
    });

    await this.syncPhones(contact.id, phones);
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
    primaryPhone: string | null,
  ): Promise<void> {
    const updates: Prisma.ContactUpdateInput = {};
    if (result.displayName) updates.name = result.displayName;
    if (result.firstName) updates.firstName = result.firstName;
    if (result.lastName) updates.lastName = result.lastName;
    if (result.jobTitle) updates.jobTitle = result.jobTitle;
    if (result.emails[0]) updates.email = result.emails[0];

    // Heal rows whose phone is a placeholder left by an earlier sync: as soon
    // as the CRM has a real number, the contact becomes dialable again.
    if (primaryPhone) {
      const existing = await this.contactRepo.findBasicById(contactId);
      if (existing && !normalizePhoneE164(existing.phoneNumber)) {
        updates.phoneNumber = primaryPhone;
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.contactRepo.update(contactId, updates).catch((err) => {
        this.logger.warn(
          `contact ${contactId} update failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }
  }

  /**
   * Dialable subset of the numbers a provider returned, in the provider's own
   * order, each paired with its E.164 form. Anything that isn't E.164-able is
   * dropped rather than stored — the dialer cannot use it and inbound call
   * matching never hits it. The raw value is kept for display.
   */
  private dialablePhones(phones: string[]): DialablePhone[] {
    const seen = new Set<string>();
    const out: DialablePhone[] = [];
    for (const raw of phones) {
      const e164 = normalizePhoneE164(raw);
      if (!e164 || seen.has(e164)) continue;
      seen.add(e164);
      out.push({ raw, e164 });
    }
    return out;
  }

  private async syncPhones(
    contactId: string,
    phones: DialablePhone[],
  ): Promise<void> {
    for (let i = 0; i < phones.length; i++) {
      await this.phoneRepo.upsert({
        contactId,
        phone: phones[i].raw,
        phoneE164: phones[i].e164,
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

  /**
   * Find a contact to merge this CRM person into, by email.
   *
   * Email is a weak identity signal in a CRM: shared mailboxes
   * (poststelle@…, info@…, sekretariat@…) legitimately belong to several
   * different people. Merging on the address alone silently collapses distinct
   * records into one contact, so a candidate already claimed by a *different*
   * external record is rejected — those two are not the same person.
   */
  private async findContactByEmail(
    ctx: OwnershipContext,
    email: string,
    connection: CrmConnection,
    externalId: string,
  ): Promise<{ id: string } | null> {
    const candidates: string[] = [];

    // Primary email on the contact row first — it is written in the same
    // statement that creates the contact, whereas the ContactEmail row lands a
    // moment later. A concurrent sync pass that only consulted ContactEmail
    // saw nothing and created a second copy of the same CRM person.
    const byPrimary = await this.contactRepo.findByEmail(ctx, email);
    if (byPrimary) candidates.push(byPrimary.id);

    for (const rec of await this.emailRepo.findByEmail(email)) {
      if (candidates.includes(rec.contactId)) continue;
      const contact = await this.contactRepo.findById(rec.contactId);
      if (!contact || contact.deletedAt) continue;
      const matchesCtx = ctx.organizationId
        ? contact.organizationId === ctx.organizationId
        : contact.userId === ctx.userId && !contact.organizationId;
      if (matchesCtx) candidates.push(contact.id);
    }

    for (const contactId of candidates) {
      const claimed = await this.linkRepo
        .findByContactId(connection.id, contactId)
        .catch(() => []);
      const takenByAnother = claimed.some(
        (link) =>
          link.externalType === "person" && link.externalId !== externalId,
      );
      if (!takenByAnother) return { id: contactId };
    }

    return null;
  }
}
