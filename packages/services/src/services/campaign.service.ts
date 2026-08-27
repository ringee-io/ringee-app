import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  CampaignRepository,
  CampaignLeadRepository,
  CampaignMemberRepository,
  ContactRepository,
  TagRepository,
  Campaign,
  CampaignLeadStatus,
  Prisma,
} from "@ringee/database";
import {
  OwnershipContext,
  CreateCampaignDto,
  UpdateCampaignStatusDto,
  ManualLeadDto,
  CSV_IMPORT_CONFIG,
  validateCsvHeaders,
  validateCsvRow,
  ALL_CSV_FIELDS,
  CsvContactRow,
  CsvRowError,
  isCampaignStatus,
} from "@ringee/platform";

export interface CampaignLeadsImportResult {
  success: boolean;
  summary: {
    totalRows: number;
    contactsCreated: number;
    leadsAdded: number;
    duplicatesSkipped: number;
    invalidRows: number;
    errors: CsvRowError[];
  };
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly campaignMemberRepo: CampaignMemberRepository,
    private readonly contactRepo: ContactRepository,
    private readonly tagRepo: TagRepository,
  ) {}

  private ensureOrganization(ctx: OwnershipContext): void {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
  }

  async createCampaign(
    ctx: OwnershipContext,
    dto: CreateCampaignDto,
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);
    return this.campaignRepo.create(ctx.userId, ctx.organizationId!, {
      name: dto.name,
      description: dto.description,
    });
  }

  async getCampaignById(
    ctx: OwnershipContext,
    id: string,
    options?: { requireMembershipForUserId?: string },
  ) {
    this.ensureOrganization(ctx);
    const campaign = await this.campaignRepo.findById(id);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }

    // Non-admin members may only open campaigns they're assigned to.
    if (options?.requireMembershipForUserId) {
      const isMember = await this.campaignMemberRepo.isMember(
        id,
        options.requireMembershipForUserId,
      );
      if (!isMember) {
        throw new ForbiddenException("You don't have access to this campaign");
      }
    }

    return campaign;
  }

  /**
   * Ownership + membership gate for the dialer (CMP-002).
   *
   * Same rule as `getCampaignById`, but a missing campaign is reported as
   * Forbidden rather than NotFound: the dialer endpoints have always answered
   * that way, and it keeps them from confirming whether a campaign id exists
   * in someone else's organization.
   */
  async assertDialableCampaign(
    ctx: OwnershipContext,
    campaignId: string,
    options: { isOrgAdmin: boolean },
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign || campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Campaign not found in your organization");
    }

    if (!options.isOrgAdmin) {
      const isMember = await this.campaignMemberRepo.isMember(
        campaignId,
        ctx.userId,
      );
      if (!isMember) {
        throw new ForbiddenException("You are not assigned to this campaign");
      }
    }

    return campaign;
  }

  /**
   * Confirm a campaign belongs to the caller's organization, without the
   * membership requirement — for acting on an existing attempt, where the
   * agent's assignment was already checked when the lead was handed to them.
   */
  async assertCampaignInWorkspace(
    ctx: OwnershipContext,
    campaignId: string,
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);
    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign || campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException(
        "Attempt does not belong to your organization",
      );
    }
    return campaign;
  }

  async listCampaigns(
    ctx: OwnershipContext,
    options?: {
      search?: string;
      status?: string;
      page?: number;
      limit?: number;
      memberUserId?: string;
    },
  ) {
    this.ensureOrganization(ctx);
    return this.campaignRepo.listByOrganization(ctx.organizationId!, options);
  }

  async updateStatus(
    ctx: OwnershipContext,
    campaignId: string,
    dto: UpdateCampaignStatusDto,
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }

    if (!isCampaignStatus(dto.status)) {
      throw new BadRequestException(`Invalid status: ${dto.status}`);
    }

    return this.campaignRepo.updateStatus(campaignId, dto.status);
  }

  async getLeads(
    ctx: OwnershipContext,
    campaignId: string,
    options?: { page?: number; limit?: number; status?: string },
  ) {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }

    return this.campaignLeadRepo.findByCampaign(campaignId, options);
  }

  /**
   * Remove a single lead from a campaign. This is a hard delete of the
   * CampaignLead row (and its cascaded call attempts / callbacks); the
   * underlying Contact is preserved. A lead that is actively being dialed
   * cannot be removed — releasing it mid-flight would corrupt the dialer
   * state, so the caller must wait for the call to wrap up first.
   */
  async deleteLead(
    ctx: OwnershipContext,
    campaignId: string,
    leadId: string,
  ): Promise<{ success: true }> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }

    const lead = await this.campaignLeadRepo.findByIdWithContact(leadId);

    if (!lead || lead.campaignId !== campaignId) {
      throw new NotFoundException("Lead not found");
    }

    const inFlightStatuses: CampaignLeadStatus[] = [
      CampaignLeadStatus.locked,
      CampaignLeadStatus.dialing,
      CampaignLeadStatus.in_call,
      CampaignLeadStatus.wrap_up,
    ];

    if (inFlightStatuses.includes(lead.status)) {
      throw new BadRequestException(
        "This lead is currently being dialed and cannot be removed. Try again once the call has wrapped up.",
      );
    }

    await this.campaignLeadRepo.deleteById(leadId);

    return { success: true };
  }

  /**
   * Put freshly added leads into the dial queue when the campaign is already
   * running.
   *
   * A lead is created `pending`, which means "staged, not released yet" — a
   * state that otherwise only ends at activation. Without this, a lead added
   * to a live campaign stayed invisible to `lockNextLead` (which only claims
   * `queued` rows) until someone paused and resumed the campaign, which is
   * exactly what `CampaignConfigService.transitionStatus` re-runs.
   *
   * The status is re-read here rather than taken from the campaign the import
   * loaded on entry: resolving contacts or parsing a large CSV takes long
   * enough that someone can activate the campaign in the meantime, and acting
   * on the stale `draft` would strand every lead the import just inserted.
   *
   * Only `active` needs it: a paused or draft campaign is released on its next
   * activation, and dialing is gated on campaign status anyway.
   */
  private async releaseLeadsIfRunning(campaignId: string): Promise<void> {
    const campaign = await this.campaignRepo.findById(campaignId);
    if (campaign?.status !== "active") return;
    const queued = await this.campaignLeadRepo.queueAllPending(campaignId);
    if (queued > 0) {
      this.logger.log(
        `Queued ${queued} newly added lead(s) into live campaign ${campaignId}`,
      );
    }
  }

  async addLeadsManually(
    ctx: OwnershipContext,
    campaignId: string,
    leads: ManualLeadDto[],
  ): Promise<CampaignLeadsImportResult> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }

    let contactsCreated = 0;
    let leadsAdded = 0;
    let duplicatesSkipped = 0;
    const contactIds: string[] = [];

    // Create/find contacts first
    for (const lead of leads) {
      let contact = await this.contactRepo.findByPhone(ctx, lead.phone);

      if (!contact) {
        contact = await this.contactRepo.create(ctx, {
          name: lead.name,
          phoneNumber: lead.phone,
          email: lead.email,
          company: lead.company,
          jobTitle: lead.jobTitle,
          locationRegion: lead.state,
          websiteUrl: lead.website,
          revenue: lead.revenue,
          companySize: lead.companySize,
        });
        contactsCreated++;
      }

      contactIds.push(contact.id);
    }

    // Check for existing leads in this campaign
    const existingContactIds =
      await this.campaignLeadRepo.findExistingContactIds(
        campaignId,
        contactIds,
      );
    const existingSet = new Set(existingContactIds);

    // Create campaign leads for new contacts only
    const newLeads = contactIds
      .map((contactId, idx) => ({
        contactId,
        metadata: (leads[idx].metadata ?? undefined) as
          | Prisma.JsonValue
          | undefined,
      }))
      .filter((l) => !existingSet.has(l.contactId));

    duplicatesSkipped = contactIds.length - newLeads.length;

    if (newLeads.length > 0) {
      leadsAdded = await this.campaignLeadRepo.createMany(campaignId, newLeads);
    }

    // Released even when this import added nothing. An earlier import that
    // created leads and then failed before releasing them leaves `pending`
    // rows behind, and this retry skips those contacts as duplicates — so a
    // release gated on `leadsAdded` would never reach them. `queueAllPending`
    // is campaign-wide and idempotent, so the unconditional call is what
    // recovers the stranded leads.
    await this.releaseLeadsIfRunning(campaignId);

    return {
      success: true,
      summary: {
        totalRows: leads.length,
        contactsCreated,
        leadsAdded,
        duplicatesSkipped,
        invalidRows: 0,
        errors: [],
      },
    };
  }

  async importLeadsFromCsv(
    ctx: OwnershipContext,
    campaignId: string,
    csvContent: string,
    tagIds?: string[],
  ): Promise<CampaignLeadsImportResult> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);

    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }

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
        continue;
      }
      seenPhones.add(phone);

      validContacts.push(validation.data!);
    }

    // Process contacts and create leads
    let contactsCreated = 0;
    let leadsAdded = 0;
    let duplicatesSkipped = 0;
    const insertedPhones: string[] = [];

    for (
      let i = 0;
      i < validContacts.length;
      i += CSV_IMPORT_CONFIG.BATCH_SIZE
    ) {
      const batch = validContacts.slice(i, i + CSV_IMPORT_CONFIG.BATCH_SIZE);
      const phonesBatch = batch.map((c) => c.phoneNumber);

      // Check existing contacts
      const existingPhones = await this.contactRepo.findByPhoneNumbers(
        ctx,
        phonesBatch,
      );
      const existingPhonesSet = new Set(existingPhones);

      await this.contactRepo.updateImportedSalesProperties(
        ctx,
        batch.filter((contact) => existingPhonesSet.has(contact.phoneNumber)),
      );

      // Create new contacts
      const newContacts = batch.filter(
        (c) => !existingPhonesSet.has(c.phoneNumber),
      );

      if (newContacts.length > 0) {
        const count = await this.contactRepo.createMany(ctx, newContacts);
        contactsCreated += count;
        insertedPhones.push(
          ...newContacts.map((contact) => contact.phoneNumber),
        );
      }

      // Get all contact IDs for this batch
      const contactIds: string[] = [];
      for (const contact of batch) {
        const dbContact = await this.contactRepo.findByPhone(
          ctx,
          contact.phoneNumber,
        );
        if (dbContact) {
          contactIds.push(dbContact.id);
        }
      }

      // Check existing leads in this campaign
      const existingLeadContactIds =
        await this.campaignLeadRepo.findExistingContactIds(
          campaignId,
          contactIds,
        );
      const existingLeadsSet = new Set(existingLeadContactIds);

      // Create campaign leads for new contacts only
      const newLeads = contactIds
        .filter((id) => !existingLeadsSet.has(id))
        .map((contactId) => ({ contactId, metadata: { source: "csv" } }));

      duplicatesSkipped += contactIds.length - newLeads.length;

      if (newLeads.length > 0) {
        const count = await this.campaignLeadRepo.createMany(
          campaignId,
          newLeads,
        );
        leadsAdded += count;
      }
    }

    // Unconditional, for the same reason as the manual path: leads left
    // `pending` by an earlier failed import are skipped as duplicates above,
    // so a count-gated release could never recover them.
    await this.releaseLeadsIfRunning(campaignId);

    if (validatedTagIds.length > 0 && insertedPhones.length > 0) {
      const newContactIds = await this.contactRepo.findContactIdsByPhoneNumbers(
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
        contactsCreated,
        leadsAdded,
        duplicatesSkipped,
        invalidRows: errors.length,
        errors: errors.slice(0, 50),
      },
    };
  }

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
}
