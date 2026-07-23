import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CallOutcome,
  Contact,
  ContactRepository,
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

@Injectable()
export class ContactService {
  constructor(
    private readonly repo: ContactRepository,
    private readonly tagRepo: TagRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
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
   * Find a contact by phone number, or create one with name "Unknown" if not found.
   */
  async findOrCreateByPhone(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<Contact> {
    const existing = await this.repo.findByPhone(ctx, phoneNumber);
    if (existing) return existing;

    return this.repo.create(ctx, {
      name: "Unknown",
      phoneNumber,
    });
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

      // Filter out existing
      const newContacts = batch.filter((c) => !existingSet.has(c.phoneNumber));
      duplicatesSkipped += batch.length - newContacts.length;

      if (newContacts.length > 0) {
        const count = await this.repo.createMany(ctx, newContacts);
        inserted += count;
        // Track inserted phone numbers for tag assignment
        insertedPhones.push(...newContacts.map((c) => c.phoneNumber));
      }
    }

    // Assign tags to imported contacts if tagIds provided
    if (validatedTagIds.length > 0 && insertedPhones.length > 0) {
      const newContactIds = await this.repo.findContactIdsByPhoneNumbers(
        ctx,
        insertedPhones,
      );
      if (newContactIds.length > 0) {
        await this.tagRepo.assignTagsToContacts(
          newContactIds,
          validatedTagIds,
        );
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
    if (!exists) throw new NotFoundException("Contacto no encontrado");
    return exists;
  }
}
