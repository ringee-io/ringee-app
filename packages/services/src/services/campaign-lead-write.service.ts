import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Campaign,
  CampaignLeadRepository,
  CampaignRepository,
  ContactRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

/**
 * The campaign lead-write boundary: the ownership gate, the contact-ownership
 * check and the queue release that every path writing a `CampaignLead` shares.
 *
 * It sits apart from {@link CampaignService} because a CRM sync needs exactly
 * this boundary and nothing else of the campaign lifecycle. `CampaignService`
 * reaches `ContactService`, which reaches `CrmContactSyncService`, so a sync
 * calling back into `CampaignService` closed a runtime cycle that only a pair
 * of `forwardRef`s kept Nest from choking on. This service depends on
 * repositories alone, so callers that come through it have no cycle to defer.
 *
 * It is still the single owner of these rules — `CampaignService` keeps the
 * lifecycle and delegates the lead writes here.
 */
@Injectable()
export class CampaignLeadWriteService {
  private readonly logger = new Logger(CampaignLeadWriteService.name);

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly campaignLeadRepo: CampaignLeadRepository,
    private readonly contactRepo: ContactRepository,
  ) {}

  /**
   * Ownership gate for writing leads into a campaign: it has to exist and it
   * has to be in the caller's organization.
   *
   * Public because a caller that writes other rows in the same request needs to
   * know the campaign resolves *before* it starts writing — a CRM sync should
   * not leave a contact behind because the campaign it named was a typo.
   */
  async assertCampaignForLeadWrite(
    ctx: OwnershipContext,
    campaignId: string,
  ): Promise<Campaign> {
    this.ensureOrganization(ctx);

    const campaign = await this.campaignRepo.findById(campaignId);
    if (!campaign) {
      throw new NotFoundException("Campaign not found");
    }
    if (campaign.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }
    return campaign;
  }

  /**
   * Add a contact that already exists in the workspace to a campaign.
   *
   * The counterpart to `CampaignService.addLeadsManually` for callers that
   * already own the Contact row — a CRM sync, not a CSV upload — so nothing
   * here touches contact fields.
   *
   * Idempotent by design: a contact that is already a lead of the campaign is
   * left exactly as it is, keeping its attempts, status and disposition
   * history across every re-sync of the same contact.
   */
  async addContactToCampaign(
    ctx: OwnershipContext,
    campaignId: string,
    contactId: string,
  ): Promise<{ added: boolean }> {
    await this.assertCampaignForLeadWrite(ctx, campaignId);

    // The campaign belongs to the caller; the contact still has to. Without
    // this check a foreign contact id would surface its name, phone and e-mail
    // in this campaign's lead table.
    const contact = await this.contactRepo.findByIdForOwner(ctx, contactId);
    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    // `@@unique([campaignId, contactId])` + skipDuplicates is what makes the
    // re-add a no-op instead of a reset of the existing lead.
    const added = await this.campaignLeadRepo.createMany(campaignId, [
      { contactId },
    ]);

    // Same reasoning as in `addLeadsManually`: released unconditionally, so a
    // lead left `pending` by an earlier interrupted write still reaches the
    // live queue.
    await this.releaseLeadsIfRunning(campaignId);

    return { added: added > 0 };
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
  async releaseLeadsIfRunning(campaignId: string): Promise<void> {
    const campaign = await this.campaignRepo.findById(campaignId);
    if (campaign?.status !== "active") return;
    const queued = await this.campaignLeadRepo.queueAllPending(campaignId);
    if (queued > 0) {
      this.logger.log(
        `Queued ${queued} newly added lead(s) into live campaign ${campaignId}`,
      );
    }
  }

  /** Campaigns are organization-only (CMP-001). */
  private ensureOrganization(ctx: OwnershipContext): void {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Campaigns require an organization");
    }
  }
}
