import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Contact, ContactRepository, TagRepository } from "@ringee/database";
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

@Injectable()
export class ContactService {
  constructor(
    private readonly repo: ContactRepository,
    private readonly tagRepo: TagRepository,
  ) { }

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
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      company: dto.organization,
      notes: dto.note
        ? { create: { content: dto.note, user: { connect: { id: ctx.userId } } } }
        : undefined,
      tags: dto.tagIds && dto.tagIds.length > 0
        ? {
            create: dto.tagIds.map(tagId => ({
              tag: { connect: { id: tagId } }
            }))
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
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      company: dto.organization,
    });
  }

  async addNoteToContact(userId: string, contactId: string, dto: AddNoteDto) {
    await this.ensureExists(contactId);
    return this.repo.addNote(contactId, userId, dto.content);
  }

  async updateLastCall(contactId: string, date: Date) {
    await this.ensureExists(contactId);
    return this.repo.updateLastCall(contactId, date);
  }

  async deleteContact(contactId: string) {
    await this.ensureExists(contactId);
    return this.repo.deleteContact(contactId);
  }

  async deleteNote(contactId: string, noteId: string) {
    await this.ensureExists(contactId);
    return this.repo.deleteNote(noteId);
  }

  async findByPhone(ctx: OwnershipContext, phoneNumber: string) {
    return this.repo.findByPhone(ctx, phoneNumber);
  }

  /**
   * Import contacts from CSV data
   */
  async importContacts(
    ctx: OwnershipContext,
    csvContent: string,
    tagIds?: string[],
  ): Promise<CsvImportResult> {
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      throw new BadRequestException("CSV file is empty");
    }

    if (lines.length > CSV_IMPORT_CONFIG.MAX_ROWS + 1) {
      throw new BadRequestException(
        `CSV file exceeds maximum of ${CSV_IMPORT_CONFIG.MAX_ROWS} rows`
      );
    }

    // Parse and validate headers
    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine);
    const headerValidation = validateCsvHeaders(headers);

    if (!headerValidation.valid) {
      throw new BadRequestException(
        `Missing required columns: ${headerValidation.missingRequired.join(", ")}`
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
        phonesBatch
      );
      const existingSet = new Set(existingPhones);

      // Filter out existing
      const newContacts = batch.filter(
        (c) => !existingSet.has(c.phoneNumber)
      );
      duplicatesSkipped += batch.length - newContacts.length;

      if (newContacts.length > 0) {
        const count = await this.repo.createMany(ctx, newContacts);
        inserted += count;
        // Track inserted phone numbers for tag assignment
        insertedPhones.push(...newContacts.map((c) => c.phoneNumber));
      }
    }

    // Assign tags to imported contacts if tagIds provided
    if (tagIds && tagIds.length > 0 && insertedPhones.length > 0) {
      const newContactIds = await this.repo.findContactIdsByPhoneNumbers(
        ctx,
        insertedPhones
      );
      if (newContactIds.length > 0) {
        await this.tagRepo.assignTagsToContacts(newContactIds, tagIds);
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

  async deleteContactsByTags(ctx: OwnershipContext, tagIds: string[]) {
    return this.repo.deleteByTags(ctx, tagIds);
  }

  private async ensureExists(id: string) {
    const exists = await this.repo.findById(id);
    if (!exists) throw new NotFoundException("Contacto no encontrado");
    return exists;
  }
}
