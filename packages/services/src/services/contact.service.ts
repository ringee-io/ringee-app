import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CallOutcome,
  CompanyRepository,
  Contact,
  ContactAffiliationRepository,
  ContactRepository,
  CrmConnection,
  Prisma,
  TagRepository,
} from "@ringee/database";
import {
  AddNoteDto,
  CreateContactDto,
  UpdateContactDto,
  OwnershipContext,
  CSV_IMPORT_CONFIG,
  CsvContactRow,
  CsvImportResult,
  CsvRowError,
  validateCsvHeaders,
  validateCsvRow,
  ALL_CSV_FIELDS,
} from "@ringee/platform";
import { CustomIntegrationOutboundService } from "./custom-integrations/custom-integration-outbound.service";
import { buildNoteEventData } from "./custom-integrations/custom-integration-event-builders";
import { CrmConnectionService } from "./crm/crm-connection.service";
import { CrmContactSyncService } from "./crm/crm-contact-sync.service";
import { CrmMatchingService } from "./crm/crm-matching.service";

/**
 * How long the dialer waits on the CRM before falling back to a bare contact.
 * A slow or degraded CRM must never delay placing a call; the contact created
 * on timeout is enriched and linked by the next sync pass anyway.
 */
const CRM_LOOKUP_TIMEOUT_MS = 4000;

/** `Contact.email` is a `VarChar(100)`; a longer address would fail the insert. */
const EMAIL_MAX = 100;

/**
 * What a calling surface already knows about the person it is about to dial.
 *
 * Everything is optional and nothing is authoritative: it fills blanks on the
 * contact, it never overwrites what somebody typed or what a CRM synced.
 */
export interface ContactIdentityHint {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  /** Attribution for a contact this hint creates, e.g. `ai-voice-agent`. */
  source?: string;
}

/** A hint reduced to the columns a contact actually stores. */
interface ContactIdentity {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

@Injectable()
export class ContactService {
  constructor(
    private readonly repo: ContactRepository,
    private readonly tagRepo: TagRepository,
    private readonly companyRepo: CompanyRepository,
    private readonly affiliationRepo: ContactAffiliationRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
    private readonly crmConnections: CrmConnectionService,
    private readonly crmMatching: CrmMatchingService,
    private readonly crmContactSync: CrmContactSyncService,
  ) {}

  async createContact(
    ctx: OwnershipContext,
    dto: CreateContactDto,
  ): Promise<Contact> {
    const exists = await this.repo.findByPhone(ctx, dto.phoneNumber);

    if (exists) {
      throw new BadRequestException("Contact already exists");
    }

    return this.repo.create(ctx, {
      name: dto.name,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      company: dto.organization,
      jobTitle: dto.jobTitle,
      locationRegion: dto.state,
      websiteUrl: dto.website,
      revenue: dto.revenue,
      companySize: dto.companySize,
      source: dto.source,
      notes: dto.note
        ? {
            create: {
              content: dto.note,
              user: { connect: { id: ctx.userId } },
            },
          }
        : undefined,
      tags:
        dto.tagIds && dto.tagIds.length > 0
          ? {
              create: dto.tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
    });
  }

  async getContactById(id: string): Promise<Contact> {
    const contact = await this.repo.findById(id);
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  async findContactByIdForOwner(
    ctx: OwnershipContext,
    id: string,
  ): Promise<Contact | null> {
    return this.repo.findByIdForOwner(ctx, id);
  }

  async listContacts(
    ctx: OwnershipContext,
    search?: string,
    sort?: string,
    page = 1,
    limit = 10,
    tagIds?: string[],
  ) {
    return this.repo.listByOwner(ctx, { search, sort, page, limit, tagIds });
  }

  /**
   * Find contacts whose calls reached one of the given outcomes (conversion /
   * engagement signals). Read-only; powers ICP learning from who already
   * bought or engaged. See {@link ContactRepository.listByCallOutcome} for the
   * `match` ("any" | "last") and reachability semantics.
   */
  async findContactsByCallOutcome(
    ctx: OwnershipContext,
    options: {
      outcomes: CallOutcome[];
      match?: "any" | "last";
      includeUnreachable?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    return this.repo.listByCallOutcome(ctx, options);
  }

  async updateContact(id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.ensureExists(id);

    if (dto.phoneNumber && dto.phoneNumber !== contact.phoneNumber) {
      const ctx: OwnershipContext = {
        userId: contact.userId,
        organizationId: contact.organizationId,
      };
      const exists = await this.repo.findByPhone(ctx, dto.phoneNumber);

      if (exists) {
        throw new BadRequestException("Contact already exists");
      }
    }

    if (dto.tagIds) {
      await this.tagRepo.setContactTags(id, dto.tagIds);
    }

    return this.repo.update(id, {
      name: dto.name,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      company: dto.organization,
      jobTitle: dto.jobTitle,
      locationRegion: dto.state,
      websiteUrl: dto.website,
      revenue: dto.revenue,
      companySize: dto.companySize,
      source: dto.source,
    });
  }

  async addNoteToContact(userId: string, contactId: string, dto: AddNoteDto) {
    const contact = await this.ensureExists(contactId);
    const note = await this.repo.addNote(contactId, userId, dto.content);
    void this.customIntegrationOutbound.enqueue({
      ctx: { userId: contact.userId, organizationId: contact.organizationId },
      eventEnum: "note_created",
      subjectId: note.id,
      data: buildNoteEventData(note, contact),
    });
    return note;
  }

  async updateLastCall(contactId: string, date: Date): Promise<Contact> {
    await this.ensureExists(contactId);
    return this.repo.updateLastCall(contactId, date);
  }

  async deleteContact(contactId: string): Promise<Contact> {
    await this.ensureExists(contactId);
    return this.repo.deleteContact(contactId);
  }

  async deleteNote(contactId: string, noteId: string) {
    await this.ensureExists(contactId);
    return this.repo.deleteNote(noteId);
  }

  /**
   * Get a contact's recent activities: calls, notes, meetings, and tags.
   */
  async getContactActivities(contactId: string): Promise<Contact> {
    const contact = await this.repo.findById(contactId);
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  async findByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<Contact | null> {
    return this.repo.findByPhone(ctx, phoneNumber);
  }

  /**
   * Find the contact for a dialed number, pulling it from a connected CRM when
   * Ringee doesn't have it yet.
   *
   * The dialer used to auto-create a bare "Unknown" row here, so a call to a
   * number that the CRM knows perfectly well landed against a nameless contact
   * with no link back to the CRM record — the call history showed "Unknown"
   * and nothing ever reconciled it. Now an exact phone match in the CRM is
   * synced in first, which carries the name, email and the external link.
   *
   * Falls back to a bare contact (blank name, so the UI shows the number) when
   * there is no CRM connection, no match, or the CRM is too slow to wait on.
   *
   * A surface that already knows who it is dialing — an AI voice agent is given
   * the person's name per call — passes a {@link ContactIdentityHint} so the
   * contact it leaves behind in Ringee is a named one instead of a bare number.
   */
  async findOrCreateByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
    hint?: ContactIdentityHint,
  ): Promise<Contact> {
    const identity = this.readIdentity(hint);

    const existing = await this.repo.findByPhone(ctx, phoneNumber);
    if (existing) return this.fillBlanks(existing, identity);

    const fromCrm = await this.findOrCreateFromCrm(ctx, phoneNumber);
    if (fromCrm) return this.fillBlanks(fromCrm, identity);

    return this.repo.create(ctx, {
      name: identity.name,
      firstName: identity.firstName,
      lastName: identity.lastName,
      fullName: identity.name,
      email: identity.email,
      phoneNumber,
      source: hint?.source ?? "dialer",
    });
  }

  /**
   * Normalizes a caller's hint into the columns a contact actually has.
   * `name` is what every list and call screen renders, so it is composed here
   * rather than left to each surface.
   */
  private readIdentity(hint?: ContactIdentityHint): ContactIdentity {
    const firstName = hint?.firstName?.trim() || null;
    const lastName = hint?.lastName?.trim() || null;
    const email = hint?.email?.trim().slice(0, EMAIL_MAX) || null;
    const name = [firstName, lastName].filter(Boolean).join(" ") || null;
    return { name, firstName, lastName, email };
  }

  /**
   * Writes the hint onto an existing contact, but only where the contact has
   * nothing. A number dialed by an agent is often a contact somebody already
   * curated — or one a CRM owns — and a per-call variable is the weaker source
   * of truth, so it may add a missing name, never replace a present one.
   */
  private async fillBlanks(
    contact: Contact,
    identity: ContactIdentity,
  ): Promise<Contact> {
    const patch: Prisma.ContactUpdateInput = {};
    if (!contact.name && identity.name) patch.name = identity.name;
    if (!contact.fullName && identity.name) patch.fullName = identity.name;
    if (!contact.firstName && identity.firstName) {
      patch.firstName = identity.firstName;
    }
    if (!contact.lastName && identity.lastName) {
      patch.lastName = identity.lastName;
    }
    if (!contact.email && identity.email) patch.email = identity.email;

    if (Object.keys(patch).length === 0) return contact;
    return this.repo.update(contact.id, patch);
  }

  /**
   * Resolve a phone number against every active CRM connection and sync the
   * matched person into Ringee. Best-effort: any failure returns null so the
   * caller falls back to a bare contact rather than failing the call.
   */
  private async findOrCreateFromCrm(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<Contact | null> {
    const connections = await this.crmConnections
      .listActive(ctx)
      .catch(() => [] as CrmConnection[]);

    for (const connection of connections) {
      const contact = await this.withTimeout(
        this.syncPersonByPhone(connection, ctx, phoneNumber),
      ).catch(() => null);
      if (contact) return contact;
    }

    return null;
  }

  private async syncPersonByPhone(
    connection: CrmConnection,
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<Contact | null> {
    const match = await this.crmMatching.resolveByPhone(
      connection,
      phoneNumber,
    );
    // Only an unambiguous person match is safe to auto-create from; company
    // matches and multi-candidate results stay unlinked for the user to resolve.
    if (match.link?.externalType !== "person") return null;

    const synced = await this.crmContactSync.syncFromCrm(
      connection,
      match.link.externalId,
      ctx,
    );
    if (!synced.contactId) return null;

    return this.repo.findById(synced.contactId);
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CRM_LOOKUP_TIMEOUT_MS);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
  }

  /**
   * Import contacts from CSV data
   */
  async importContacts(
    ctx: OwnershipContext,
    csvContent: string,
    tagIds?: string[],
  ): Promise<CsvImportResult> {
    const validatedTagIds = await this.validateImportTagIds(ctx, tagIds);
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      throw new BadRequestException("CSV file is empty");
    }

    if (lines.length > CSV_IMPORT_CONFIG.MAX_ROWS + 1) {
      throw new BadRequestException(
        `CSV file exceeds maximum of ${CSV_IMPORT_CONFIG.MAX_ROWS} rows`,
      );
    }

    // Parse and validate headers
    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine);
    const headerValidation = validateCsvHeaders(headers);

    if (!headerValidation.valid) {
      throw new BadRequestException(
        `Missing required columns: ${headerValidation.missingRequired.join(", ")}`,
      );
    }

    // Map headers to indices
    const headerIndices = new Map<string, number>();
    headers.forEach((h, i) => headerIndices.set(h.trim().toLowerCase(), i));

    const errors: CsvRowError[] = [];
    const validContacts: CsvContactRow[] = [];
    const seenPhones = new Set<string>();

    // Parse and validate each row
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const values = this.parseCsvLine(lines[i]);

      // Build row object
      const row: Record<string, string> = {};
      for (const field of ALL_CSV_FIELDS) {
        const idx = headerIndices.get(field.toLowerCase());
        row[field] = idx !== undefined ? values[idx] || "" : "";
      }

      const validation = validateCsvRow(row, rowNum);

      if (!validation.valid) {
        errors.push(...validation.errors);
        continue;
      }

      // Check for duplicates within the same file
      const phone = validation.data!.phoneNumber;
      if (seenPhones.has(phone)) {
        continue; // Skip duplicate in same file silently
      }
      seenPhones.add(phone);

      validContacts.push(validation.data!);
    }

    // Process in batches
    let inserted = 0;
    let duplicatesSkipped = 0;
    const insertedPhones: string[] = [];

    for (
      let i = 0;
      i < validContacts.length;
      i += CSV_IMPORT_CONFIG.BATCH_SIZE
    ) {
      const batch = validContacts.slice(i, i + CSV_IMPORT_CONFIG.BATCH_SIZE);
      const phonesBatch = batch.map((c) => c.phoneNumber);

      // Check existing in DB
      const existingPhones = await this.repo.findByPhoneNumbers(
        ctx,
        phonesBatch,
      );
      const existingSet = new Set(existingPhones);

      await this.repo.updateImportedSalesProperties(
        ctx,
        batch.filter((contact) => existingSet.has(contact.phoneNumber)),
      );

      // Filter out existing
      const newContacts = batch.filter((c) => !existingSet.has(c.phoneNumber));
      duplicatesSkipped += batch.length - newContacts.length;

      if (newContacts.length > 0) {
        const count = await this.repo.createMany(ctx, newContacts);
        inserted += count;
        // Track inserted phone numbers for tag assignment
        insertedPhones.push(...newContacts.map((c) => c.phoneNumber));
      }

      await this.syncImportedCompanyLinkedinProfiles(ctx, batch);
    }

    // Assign tags to imported contacts if tagIds provided
    if (validatedTagIds.length > 0 && insertedPhones.length > 0) {
      const newContactIds = await this.repo.findContactIdsByPhoneNumbers(
        ctx,
        insertedPhones,
      );
      if (newContactIds.length > 0) {
        await this.tagRepo.assignTagsToContacts(newContactIds, validatedTagIds);
      }
    }

    return {
      success: true,
      summary: {
        totalRows: lines.length - 1,
        inserted,
        duplicatesSkipped,
        invalidRows: errors.length,
        errors: errors.slice(0, 50), // Limit errors returned
      },
    };
  }

  /**
   * Persist the company LinkedIn column through Ringee's canonical Company +
   * ContactAffiliation models. A missing value is ignored, and a CSV import
   * never clears an existing company profile.
   */
  async syncImportedCompanyLinkedinProfiles(
    ctx: OwnershipContext,
    rows: CsvContactRow[],
  ): Promise<void> {
    const rowsWithCompanyLinkedin = rows.filter(
      (row) => row.companyLinkedinUrl,
    );
    if (rowsWithCompanyLinkedin.length === 0) return;

    const contacts = await this.repo.findImportTargetsByPhoneNumbers(
      ctx,
      rowsWithCompanyLinkedin.map((row) => row.phoneNumber),
    );
    const contactByPhone = new Map(
      contacts.map((contact) => [contact.phoneNumber, contact]),
    );

    const companyInputs = new Map<
      string,
      { name: string; linkedinUrl: string; website?: string }
    >();

    for (const row of rowsWithCompanyLinkedin) {
      const contact = contactByPhone.get(row.phoneNumber);
      const companyName = row.company?.trim() || contact?.company?.trim();
      const linkedinUrl = row.companyLinkedinUrl?.trim();
      if (!contact || !companyName || !linkedinUrl) continue;

      companyInputs.set(companyName.toLowerCase(), {
        name: companyName,
        linkedinUrl,
        website: row.website,
      });
    }

    const companyByName = new Map<
      string,
      Awaited<ReturnType<CompanyRepository["upsertActiveByName"]>>
    >();

    for (const [normalizedName, input] of companyInputs) {
      const company = await this.companyRepo.upsertActiveByName(ctx, {
        name: input.name,
        website: input.website ?? null,
        linkedinUrl: input.linkedinUrl,
        source: "csv_import",
      });
      companyByName.set(normalizedName, company);
    }

    await Promise.all(
      rowsWithCompanyLinkedin.map(async (row) => {
        const contact = contactByPhone.get(row.phoneNumber);
        const companyName = row.company?.trim() || contact?.company?.trim();
        if (!contact || !companyName) return;

        const company = companyByName.get(companyName.toLowerCase());
        if (!company) return;

        await this.affiliationRepo.upsert({
          contactId: contact.id,
          companyId: company.id,
          role: row.jobTitle ?? contact.jobTitle,
          isPrimary: true,
        });
      }),
    );
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  }

  private async validateImportTagIds(
    ctx: OwnershipContext,
    tagIds?: string[],
  ): Promise<string[]> {
    const uniqueTagIds = [...new Set(tagIds ?? [])];
    if (uniqueTagIds.length === 0) return [];

    const ownedTagIds = await this.tagRepo.findOwnedIds(ctx, uniqueTagIds);
    if (ownedTagIds.length !== uniqueTagIds.length) {
      throw new BadRequestException(
        "One or more tags are invalid or do not belong to this workspace",
      );
    }

    return uniqueTagIds;
  }

  async deleteContactsByTags(ctx: OwnershipContext, tagIds: string[]) {
    return this.repo.deleteByTags(ctx, tagIds);
  }

  private async ensureExists(id: string) {
    const exists = await this.repo.findById(id);
    if (!exists) throw new NotFoundException("Contact not found");
    return exists;
  }
}
