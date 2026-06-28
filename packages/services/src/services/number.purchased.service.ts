import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  NumberPurchased,
  NumberPurchasedRepository,
  NumberRequirementValueRepository,
  RequirementValueWithDocument,
  UserRepository,
} from "@ringee/database";
import {
  TelephonyService,
  CostInformation,
  OwnershipContext,
  PurchaseNumbers,
  NumberOrderRequirements,
  NumberVerificationOutcome,
  DraftRegulatoryRequirementInput,
  RegulatoryRequirementValue,
  RequirementDraft,
  ResendProvider,
  SubmitRegulatoryRequirementInput,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { RegulatoryDocumentService } from "./regulatory-document.service";

/** Internal address copied on every regulatory-submission follow-up email. */
const REGULATORY_FOLLOWUP_CC = "edisonpadilla.dev@gmail.com";

@Injectable()
export class NumberPurchasedService {
  private readonly logger = new Logger(NumberPurchasedService.name);

  private readonly email = new ResendProvider();

  constructor(
    private readonly numberPurchasedRepository: NumberPurchasedRepository,
    private telephonyService: TelephonyService,
    private readonly userRepository: UserRepository,
    private readonly requirementValueRepository: NumberRequirementValueRepository,
    private readonly regulatoryDocumentService: RegulatoryDocumentService,
  ) {}

  release(id: string): Promise<NumberPurchased> {
    return this.numberPurchasedRepository.release(id);
  }

  assignToOwner(
    numberId: string,
    ctx: OwnershipContext,
  ): Promise<NumberPurchased> {
    return this.numberPurchasedRepository.assignToOwner(numberId, ctx);
  }

  findByOwner(ctx: OwnershipContext): Promise<NumberPurchased[]> {
    return this.numberPurchasedRepository.findByOwner(ctx);
  }

  /**
   * True when `phoneNumber` is one of this owner's verified caller IDs. Calls
   * placed from a verified caller ID carry an extra profit margin, so the cost
   * handler uses this to decide whether the surcharge applies.
   */
  async isVerifiedCallerId(
    ctx: OwnershipContext,
    phoneNumber: string,
  ): Promise<boolean> {
    const number =
      await this.numberPurchasedRepository.findByPhoneNumber(phoneNumber);
    if (
      !number ||
      number.kind !== "verified_caller_id" ||
      !number.verified ||
      number.deletedAt
    ) {
      return false;
    }
    return ctx.organizationId
      ? number.organizationId === ctx.organizationId
      : number.userId === ctx.userId;
  }

  findOneByNumber(number: string): Promise<NumberPurchased | null> {
    return this.numberPurchasedRepository.findOne({
      phoneNumber: number,
      assignedDate: { not: null },
    });
  }

  /**
   * Reads messaging capabilities from the provider for a given purchased
   * number and persists a snapshot (smsEnabled / mmsEnabled / messagingEnabled
   * + the assigned messaging profile id when known) on `NumberPurchased`,
   * and propagates allowed actions onto every `UserNumber` row.
   *
   * Returns the updated row, or null when the number is not found.
   */
  async refreshMessagingCapabilities(
    numberPurchasedId: string,
  ): Promise<NumberPurchased | null> {
    const number =
      await this.numberPurchasedRepository.findById(numberPurchasedId);
    if (!number) throw new NotFoundException("Number not found");

    let features: {
      sms?: boolean;
      mms?: boolean;
      voice?: boolean;
      fax?: boolean;
      hdVoice?: boolean;
      internationalSms?: boolean;
      emergency?: boolean;
      raw?: any;
    } = {};
    try {
      features = await this.telephonyService.getPhoneNumberFeatures(
        number.phoneNumber,
      );
    } catch (err) {
      this.logger.warn(
        `Could not read messaging features for ${number.phoneNumber}: ${(err as Error).message}`,
      );
      // Persist that we tried; leave snapshot as-is.
      await this.numberPurchasedRepository.update(numberPurchasedId, {
        messagingStatus: "lookup_failed",
        messagingError: (err as Error).message,
      });
      return number;
    }

    const smsEnabled = !!features.sms;
    const mmsEnabled = !!features.mms;
    const voiceEnabled = features.voice ?? true;
    const faxEnabled = !!features.fax;
    const hdVoiceEnabled = features.hdVoice ?? true;
    const internationalSmsEnabled = !!features.internationalSms;
    const emergencyEnabled = !!features.emergency;
    const messagingEnabled = smsEnabled || mmsEnabled;
    const profileId =
      features.raw?.messaging_profile_id ??
      apiConfiguration.TELNYX_MESSAGING_PROFILE_ID ??
      null;

    const updated = await this.numberPurchasedRepository.update(
      numberPurchasedId,
      {
        smsEnabled,
        mmsEnabled,
        voiceEnabled,
        faxEnabled,
        hdVoiceEnabled,
        internationalSmsEnabled,
        emergencyEnabled,
        messagingEnabled,
        providerMessagingProfileId: profileId,
        messagingStatus: messagingEnabled ? "ready" : "unavailable",
        messagingError: null,
        features: {
          sms: smsEnabled,
          mms: mmsEnabled,
          voice: voiceEnabled,
          fax: faxEnabled,
          hdVoice: hdVoiceEnabled,
          internationalSms: internationalSmsEnabled,
          emergency: emergencyEnabled,
        },
      },
    );

    // Propagate to UserNumber capability flags so users with this number
    // can compose SMS/MMS from the inbox.
    await this.numberPurchasedRepository.updateMessagingForUserNumbers(
      numberPurchasedId,
      {
        canSendSms: smsEnabled,
        canReceiveSms: smsEnabled,
        canSendMms: mmsEnabled,
        canReceiveMms: mmsEnabled,
      },
    );

    return updated;
  }

  /**
   * Resolves the messaging profile a number should be attached to and, when
   * needed, links it on the provider. Telnyx will not route SMS/MMS for a
   * number that is not attached to a messaging profile, so any number with
   * messaging enabled must be linked at provision time.
   *
   * - If the provider already reports a profile (number is linked), reuse it.
   * - Otherwise, attach the configured `TELNYX_MESSAGING_PROFILE_ID`.
   * - Best-effort: a provider failure is logged and returns null so the
   *   purchase/provision is not blocked (messagingStatus reflects "pending").
   */
  private async applyMessagingProfile(
    phoneNumber: string,
    messagingEnabled: boolean,
    detectedProfileId?: string | null,
  ): Promise<string | null> {
    if (!messagingEnabled) return detectedProfileId ?? null;
    if (detectedProfileId) return detectedProfileId;

    const configured = apiConfiguration.TELNYX_MESSAGING_PROFILE_ID;
    if (!configured) {
      this.logger.warn(
        `Number ${phoneNumber} has messaging enabled but TELNYX_MESSAGING_PROFILE_ID is not set; ` +
          `messages will not route until a messaging profile is assigned.`,
      );
      return null;
    }

    try {
      const assigned = await this.telephonyService.setMessagingProfile(
        phoneNumber,
        configured,
      );
      return assigned ?? configured;
    } catch (err) {
      this.logger.warn(
        `Failed to attach messaging profile to ${phoneNumber}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async buyNumber(
    ctx: OwnershipContext,
    numberId: string,
    costInformation: CostInformation,
  ): Promise<NumberPurchased> {
    const purchase = await this.telephonyService.purchaseNumbers([numberId]);
    const phoneNumber = purchase.phoneNumbers[0]!;

    // Countries that require document verification come back with the order in
    // a `pending` state and the number not yet provisioned (no connection, no
    // readable features). Persist it as `pending` instead of throwing so the
    // user's payment is recorded and the platform can prompt them to upload the
    // required documents. See getRegulatoryRequirements for the document list.
    if (phoneNumber.requirementsMet === false) {
      this.logger.warn(
        `Number ${phoneNumber.phoneNumber} requires regulatory verification ` +
          `(order ${purchase.orderId}); saving as pending.`,
      );
      return this.createPendingNumber(
        ctx,
        phoneNumber,
        purchase,
        costInformation,
      );
    }

    const numbers = await this.numberPurchasedRepository.findByOwner(ctx);

    const foundPrimaryNumber = numbers.find((number) => {
      const primaryNumber = number.userNumbers?.find(
        (userNumber) => userNumber.isPrimary,
      );

      return primaryNumber !== undefined;
    });

    let providerFeatures: {
      sms?: boolean;
      mms?: boolean;
      voice?: boolean;
      fax?: boolean;
      hdVoice?: boolean;
      internationalSms?: boolean;
      emergency?: boolean;
      raw?: any;
    } = {};
    try {
      providerFeatures = await this.telephonyService.getPhoneNumberFeatures(
        phoneNumber.phoneNumber,
      );
    } catch (err) {
      this.logger.warn(
        `Could not read features at purchase time for ${phoneNumber.phoneNumber}: ${(err as Error).message}`,
      );
    }

    const smsEnabled = !!providerFeatures.sms;
    const mmsEnabled = !!providerFeatures.mms;
    const voiceEnabled = providerFeatures.voice ?? true;
    const faxEnabled = !!providerFeatures.fax;
    const hdVoiceEnabled = providerFeatures.hdVoice ?? true;
    const internationalSmsEnabled = !!providerFeatures.internationalSms;
    const emergencyEnabled = !!providerFeatures.emergency;
    const messagingEnabled = smsEnabled || mmsEnabled;
    const profileId = await this.applyMessagingProfile(
      phoneNumber.phoneNumber,
      messagingEnabled,
      providerFeatures.raw?.messaging_profile_id ?? null,
    );

    const created = await this.numberPurchasedRepository.create(ctx, {
      userNumbers: {
        create: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          isPrimary: !foundPrimaryNumber,
          canCall: true,
          canReceive: true,
          canRecord: false,
          enabled: true,
          canSendSms: smsEnabled,
          canReceiveSms: smsEnabled,
          canSendMms: mmsEnabled,
          canReceiveMms: mmsEnabled,
        },
      },
      phoneNumber: phoneNumber.phoneNumber,
      isoCountry: phoneNumber.countryCode,
      phoneNumberType: phoneNumber.phoneNumberType,
      status: "assigned",
      provider: purchase.provider,
      providerNumberId: phoneNumber.id,
      providerOrderId: purchase.orderId,
      providerConnectionId: phoneNumber.connectionId,
      providerConnectionName: phoneNumber.connectionName,
      purchaseDate: new Date(),
      assignedDate: new Date(),
      billingGroupId: purchase.billingGroupId,
      monthlyCost: costInformation.monthlyCost,
      currency: costInformation.currency,
      upfrontCost: costInformation.upfrontCost,
      features: {
        sms: smsEnabled,
        mms: mmsEnabled,
        voice: voiceEnabled,
        fax: faxEnabled,
        hdVoice: hdVoiceEnabled,
        internationalSms: internationalSmsEnabled,
        emergency: emergencyEnabled,
      },
      smsEnabled,
      mmsEnabled,
      voiceEnabled,
      faxEnabled,
      hdVoiceEnabled,
      internationalSmsEnabled,
      emergencyEnabled,
      messagingEnabled,
      providerMessagingProfileId: profileId,
      messagingStatus: messagingEnabled
        ? profileId
          ? "ready"
          : "pending"
        : "unavailable",
    });

    return created;
  }

  /**
   * Persists a freshly ordered number whose regulatory requirements are not yet
   * met. The number is NOT assigned to a connection and has no `assignedDate`,
   * so it cannot be used to place calls until verification completes. The
   * UserNumber is created disabled so it shows up in "My numbers" as pending
   * without being selectable as a caller ID.
   */
  private createPendingNumber(
    ctx: OwnershipContext,
    phoneNumber: PurchaseNumbers["phoneNumbers"][number],
    purchase: PurchaseNumbers,
    costInformation: CostInformation,
  ): Promise<NumberPurchased> {
    return this.numberPurchasedRepository.create(ctx, {
      userNumbers: {
        create: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          isPrimary: false,
          canCall: false,
          canReceive: false,
          canRecord: false,
          enabled: false,
          canSendSms: false,
          canReceiveSms: false,
          canSendMms: false,
          canReceiveMms: false,
        },
      },
      phoneNumber: phoneNumber.phoneNumber,
      isoCountry: phoneNumber.countryCode,
      phoneNumberType: phoneNumber.phoneNumberType,
      status: "pending",
      provider: purchase.provider,
      providerNumberId: phoneNumber.id,
      providerOrderId: purchase.orderId,
      purchaseDate: new Date(),
      // No assignedDate / connection: number is not provisioned yet.
      billingGroupId: purchase.billingGroupId,
      monthlyCost: costInformation.monthlyCost,
      currency: costInformation.currency,
      upfrontCost: costInformation.upfrontCost,
      messagingStatus: "pending",
    });
  }

  /**
   * Reads the regulatory requirements (documents / fields) still needed for a
   * pending number, enriched with descriptions so the UI can guide the user.
   */
  async getNumberRequirements(
    numberPurchasedId: string,
  ): Promise<NumberOrderRequirements> {
    const number =
      await this.numberPurchasedRepository.findById(numberPurchasedId);
    if (!number) throw new NotFoundException("Number not found");
    if (!number.providerNumberId) {
      throw new BadRequestException(
        "This number has no provider order to fulfil requirements for",
      );
    }

    const result = await this.telephonyService.getNumberOrderRequirements(
      number.providerNumberId,
    );

    // Merge locally-saved form values so the UI can prefill on reload.
    const saved = await this.requirementValueRepository.findByNumber(number.id);
    const draftByRequirement = new Map<string, RequirementDraft>();
    for (const value of saved) {
      draftByRequirement.set(value.requirementId, this.toDraft(value));
    }

    return {
      ...result,
      requirements: result.requirements.map((req) => ({
        ...req,
        draft: draftByRequirement.get(req.id) ?? null,
      })),
    };
  }

  /** Maps a persisted requirement value into the draft shape the UI expects. */
  private toDraft(value: RequirementValueWithDocument): RequirementDraft {
    if (value.fieldType === "document") {
      return { document: value.regulatoryDocument };
    }
    if (value.fieldType === "address") {
      return {
        address: (value.addressJson as Record<string, unknown> | null) ?? null,
      };
    }
    return { textValue: value.textValue };
  }

  /**
   * Persists the verification form as the user fills it (autosave), without
   * contacting the provider. Document selections are validated to belong to the
   * caller's workspace before they are linked.
   */
  async saveRequirementDraft(
    ctx: OwnershipContext,
    numberPurchasedId: string,
    inputs: DraftRegulatoryRequirementInput[],
  ): Promise<{ saved: number }> {
    const number =
      await this.numberPurchasedRepository.findById(numberPurchasedId);
    if (!number) throw new NotFoundException("Number not found");

    for (const input of inputs) {
      if (!input.requirementId) continue;

      if (input.fieldType === "document") {
        if (input.regulatoryDocumentId) {
          await this.regulatoryDocumentService.assertOwned(
            ctx,
            input.regulatoryDocumentId,
          );
        }
        await this.requirementValueRepository.upsert(
          number.id,
          input.requirementId,
          {
            fieldType: "document",
            regulatoryDocumentId: input.regulatoryDocumentId ?? null,
            textValue: null,
            addressJson: null,
          },
        );
      } else if (input.fieldType === "address") {
        await this.requirementValueRepository.upsert(
          number.id,
          input.requirementId,
          {
            fieldType: "address",
            addressJson: input.address ?? null,
            textValue: null,
            regulatoryDocumentId: null,
          },
        );
      } else {
        await this.requirementValueRepository.upsert(
          number.id,
          input.requirementId,
          {
            fieldType: "textual",
            textValue: input.textValue ?? null,
            addressJson: null,
            regulatoryDocumentId: null,
          },
        );
      }
    }

    return { saved: inputs.length };
  }

  /**
   * Resolves each submitted requirement into a provider field_value (uploading
   * stored documents to the provider and creating addresses as needed),
   * persists the values, submits them to the provider, then emails a
   * descriptive follow-up to the client (CC the internal inbox) so any further
   * communication with the provider can happen in that thread.
   */
  async submitNumberRequirements(
    ctx: OwnershipContext,
    numberPurchasedId: string,
    inputs: SubmitRegulatoryRequirementInput[],
  ): Promise<NumberOrderRequirements> {
    const number =
      await this.numberPurchasedRepository.findById(numberPurchasedId);
    if (!number) throw new NotFoundException("Number not found");
    if (!number.providerNumberId) {
      throw new BadRequestException(
        "This number has no provider order to fulfil requirements for",
      );
    }
    if (!inputs?.length) {
      throw new BadRequestException("No requirements provided");
    }

    // Track a human-readable summary per requirement for the follow-up email,
    // and the persisted form value so a reload reflects what was submitted.
    const summaries: { requirementId: string; summary: string }[] = [];
    const values: RegulatoryRequirementValue[] = [];
    const now = new Date();

    for (const input of inputs) {
      if (!input.requirementId) {
        throw new BadRequestException("Missing requirementId on a requirement");
      }

      if (input.fieldType === "address") {
        if (!input.address) {
          throw new BadRequestException(
            `Requirement ${input.requirementId} needs an address`,
          );
        }
        const { addressId } = await this.telephonyService.createAddress(
          input.address,
        );
        values.push({
          requirementId: input.requirementId,
          fieldValue: addressId,
        });
        summaries.push({
          requirementId: input.requirementId,
          summary: `Address: ${this.formatAddress(input.address)} (Telnyx address ${addressId})`,
        });
        await this.requirementValueRepository.upsert(
          number.id,
          input.requirementId,
          {
            fieldType: "address",
            addressJson: input.address,
            textValue: null,
            regulatoryDocumentId: null,
            submittedAt: now,
          },
        );
      } else if (input.fieldType === "document") {
        if (!input.regulatoryDocumentId) {
          throw new BadRequestException(
            `Requirement ${input.requirementId} needs a document`,
          );
        }
        const doc = await this.regulatoryDocumentService.getOwnedOrThrow(
          ctx,
          input.regulatoryDocumentId,
        );
        const telnyxDocumentId =
          await this.regulatoryDocumentService.resolveTelnyxDocumentId(doc);
        values.push({
          requirementId: input.requirementId,
          fieldValue: telnyxDocumentId,
        });
        summaries.push({
          requirementId: input.requirementId,
          summary: `Document "${doc.filename}" (Telnyx document ${telnyxDocumentId})`,
        });
        await this.requirementValueRepository.upsert(
          number.id,
          input.requirementId,
          {
            fieldType: "document",
            regulatoryDocumentId: doc.id,
            textValue: null,
            addressJson: null,
            submittedAt: now,
          },
        );
      } else {
        const text = input.textValue?.trim();
        if (!text) {
          throw new BadRequestException(
            `Requirement ${input.requirementId} needs a value`,
          );
        }
        values.push({ requirementId: input.requirementId, fieldValue: text });
        summaries.push({
          requirementId: input.requirementId,
          summary: text,
        });
        await this.requirementValueRepository.upsert(
          number.id,
          input.requirementId,
          {
            fieldType: "textual",
            textValue: text,
            addressJson: null,
            regulatoryDocumentId: null,
            submittedAt: now,
          },
        );
      }
    }

    const result = await this.telephonyService.submitNumberOrderRequirements(
      number.providerNumberId,
      values,
    );

    // A previously rejected number goes back to `pending` so the reconciliation
    // poller re-evaluates it once the carrier reviews the resubmission.
    if (number.status !== "pending") {
      await this.numberPurchasedRepository.update(number.id, {
        status: "pending",
      });
    }

    // Best-effort follow-up email; never fail the submission because email did.
    try {
      await this.sendRequirementsSubmittedEmail(number, result, summaries);
    } catch (err) {
      this.logger.error(
        `Requirements submitted for ${number.phoneNumber} but follow-up email failed: ${(err as Error).message}`,
      );
    }

    return result;
  }

  private formatAddress(a: {
    businessName?: string;
    firstName?: string;
    lastName?: string;
    streetAddress: string;
    extendedAddress?: string;
    locality: string;
    administrativeArea?: string;
    postalCode?: string;
    countryCode: string;
  }): string {
    const who =
      a.businessName || `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
    return [
      who,
      a.streetAddress,
      a.extendedAddress,
      a.locality,
      a.administrativeArea,
      a.postalCode,
      a.countryCode,
    ]
      .filter(Boolean)
      .join(", ");
  }

  private async resolveClient(
    number: NumberPurchased,
  ): Promise<{ email: string | null; name: string }> {
    if (!number.userId) return { email: null, name: "Ringee user" };
    const user = await this.userRepository.findById(number.userId);
    const emails = (
      user as unknown as { emails?: { email: string; isPrimary: boolean }[] }
    )?.emails;
    const email =
      emails?.find((e) => e.isPrimary)?.email ?? emails?.[0]?.email ?? null;
    const name =
      `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
      "Ringee user";
    return { email, name };
  }

  private async sendRequirementsSubmittedEmail(
    number: NumberPurchased,
    result: NumberOrderRequirements,
    summaries: { requirementId: string; summary: string }[],
  ): Promise<void> {
    const client = await this.resolveClient(number);

    // Map each submitted requirement to its human-readable name when known.
    const nameById = new Map(
      result.requirements.map((r) => [r.id, r.name] as const),
    );
    const rows = summaries
      .map((s) => {
        const label = nameById.get(s.requirementId) ?? s.requirementId;
        return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;vertical-align:top;">${escapeHtml(s.summary)}</td>
        </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;max-width:640px;">
        <h2 style="margin:0 0 12px;">Verification documents submitted</h2>
        <p>The regulatory documents for the number below have been submitted to Telnyx and are now under review.</p>
        <table style="border-collapse:collapse;margin:12px 0;">
          <tr><td style="padding:4px 12px;color:#737373;">Phone number</td><td style="padding:4px 12px;"><strong>${escapeHtml(number.phoneNumber)}</strong></td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Country</td><td style="padding:4px 12px;">${escapeHtml(number.isoCountry)} (${escapeHtml(number.phoneNumberType ?? "local")})</td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Order</td><td style="padding:4px 12px;">${escapeHtml(number.providerOrderId ?? "")}</td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Status</td><td style="padding:4px 12px;">${escapeHtml(result.requirementsStatus)}</td></tr>
        </table>
        <h3 style="margin:16px 0 4px;">Submitted requirements</h3>
        <table style="border-collapse:collapse;width:100%;">${rows}</table>
        <p style="margin-top:16px;color:#737373;">
          Telnyx usually reviews regulatory documents within a couple of business days.
          Reply to this email to follow up — both the account owner and the Ringee team are on this thread.
        </p>
      </div>
    `;

    const recipients = client.email ? [client.email] : [REGULATORY_FOLLOWUP_CC];
    const cc = client.email ? [REGULATORY_FOLLOWUP_CC] : undefined;

    await this.email.sendEmail(
      recipients,
      `Verification submitted for ${number.phoneNumber}`,
      html,
      "Ringee Notifications",
      apiConfiguration.EMAIL_FROM_ADDRESS,
      REGULATORY_FOLLOWUP_CC,
      cc,
    );
  }

  // ────────────────────────────────────────────────────────────
  // Reconciliation (orchestrator poller)
  // ────────────────────────────────────────────────────────────

  /**
   * Polls the provider for every number still awaiting regulatory approval and
   * transitions it: approved → provision + notify; rejected/expired → mark +
   * notify with reasons; otherwise leave pending. Returns how many numbers
   * changed state this run. Per-number failures are isolated and logged.
   */
  async reconcilePendingVerifications(): Promise<number> {
    const pending =
      await this.numberPurchasedRepository.findPendingProviderOrders();
    let changed = 0;

    for (const number of pending) {
      try {
        const outcome = await this.reconcileOne(number);
        if (outcome !== "pending") changed++;
      } catch (err) {
        this.logger.error(
          `Failed to reconcile verification for ${number.phoneNumber}: ${(err as Error).message}`,
        );
      }
    }

    return changed;
  }

  private async reconcileOne(
    number: NumberPurchased,
  ): Promise<NumberVerificationOutcome> {
    const result = await this.telephonyService.getNumberOrderRequirements(
      number.providerNumberId!,
    );
    const outcome = classifyVerification(result);

    if (outcome === "approved") {
      const provisioned = await this.provisionApprovedNumber(number);
      // Assignment can fail transiently — leave pending so the next tick retries.
      if (!provisioned) return "pending";
      await this.sendVerificationApprovedEmail(number);
      this.logger.log(`Number ${number.phoneNumber} approved and provisioned`);
      return "approved";
    }

    if (outcome === "rejected" || outcome === "expired") {
      await this.numberPurchasedRepository.update(number.id, {
        status: outcome,
      });
      await this.sendVerificationRejectedEmail(number, result, outcome);
      this.logger.log(`Number ${number.phoneNumber} verification ${outcome}`);
      return outcome;
    }

    return "pending";
  }

  /**
   * Assigns an approved number to the voice connection and flips it to
   * `assigned`, enabling its UserNumber so it can place calls. Returns false if
   * the provider assignment failed (caller leaves it pending to retry).
   */
  private async provisionApprovedNumber(
    number: NumberPurchased,
  ): Promise<boolean> {
    let connectionId = "";
    let connectionName = "";
    try {
      const assigned = await this.telephonyService.assignNumberToConnection(
        number.phoneNumber,
      );
      connectionId = assigned.connectionId;
      connectionName = assigned.connectionName;
    } catch (err) {
      // The provider PATCH fails permanently when the number's order was
      // deleted on Telnyx (the phone number no longer exists there), so the
      // assignment would never succeed and the number would loop in `pending`
      // forever. Fall back to the configured default connection so we can
      // still finish provisioning locally.
      const fallbackConnectionId = apiConfiguration.TELNYX_CONNECTION_ID;
      if (!fallbackConnectionId) {
        this.logger.warn(
          `Approved number ${number.phoneNumber} could not be assigned to a connection yet: ${(err as Error).message}`,
        );
        return false;
      }
      this.logger.warn(
        `Approved number ${number.phoneNumber} could not be assigned via the provider (${(err as Error).message}); falling back to TELNYX_CONNECTION_ID`,
      );
      connectionId = fallbackConnectionId;
    }

    let features: {
      sms?: boolean;
      mms?: boolean;
      voice?: boolean;
      fax?: boolean;
      hdVoice?: boolean;
      internationalSms?: boolean;
      emergency?: boolean;
      raw?: any;
    } = {};
    try {
      features = await this.telephonyService.getPhoneNumberFeatures(
        number.phoneNumber,
      );
    } catch (err) {
      this.logger.warn(
        `Could not read features for newly provisioned ${number.phoneNumber}: ${(err as Error).message}`,
      );
    }

    const smsEnabled = !!features.sms;
    const mmsEnabled = !!features.mms;
    const messagingEnabled = smsEnabled || mmsEnabled;
    const profileId = await this.applyMessagingProfile(
      number.phoneNumber,
      messagingEnabled,
      features.raw?.messaging_profile_id ?? null,
    );

    // Match buyNumber: become the owner's primary number only if they have none.
    const ctx: OwnershipContext = {
      userId: number.userId!,
      organizationId: number.organizationId ?? null,
    };
    const owned = await this.numberPurchasedRepository.findByOwner(ctx);
    const hasPrimary = owned.some((n) =>
      n.userNumbers?.some((u) => u.isPrimary),
    );

    await this.numberPurchasedRepository.update(number.id, {
      status: "assigned",
      assignedDate: new Date(),
      providerConnectionId: connectionId,
      providerConnectionName: connectionName,
      smsEnabled,
      mmsEnabled,
      voiceEnabled: features.voice ?? true,
      faxEnabled: !!features.fax,
      hdVoiceEnabled: features.hdVoice ?? true,
      internationalSmsEnabled: !!features.internationalSms,
      emergencyEnabled: !!features.emergency,
      messagingEnabled,
      providerMessagingProfileId: profileId,
      messagingStatus: messagingEnabled
        ? profileId
          ? "ready"
          : "pending"
        : "unavailable",
      features: {
        sms: smsEnabled,
        mms: mmsEnabled,
        voice: features.voice ?? true,
        fax: !!features.fax,
        hdVoice: features.hdVoice ?? true,
        internationalSms: !!features.internationalSms,
        emergency: !!features.emergency,
      },
    });

    await this.numberPurchasedRepository.enableUserNumbersOnProvision(
      number.id,
      !hasPrimary,
    );
    await this.numberPurchasedRepository.updateMessagingForUserNumbers(
      number.id,
      {
        canSendSms: smsEnabled,
        canReceiveSms: smsEnabled,
        canSendMms: mmsEnabled,
        canReceiveMms: mmsEnabled,
      },
    );

    return true;
  }

  private async sendVerificationApprovedEmail(
    number: NumberPurchased,
  ): Promise<void> {
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;max-width:640px;">
        <h2 style="margin:0 0 12px;">Your number is verified and active 🎉</h2>
        <p>Good news — the carrier approved the regulatory documents for <strong>${escapeHtml(number.phoneNumber)}</strong>. The number is now active and ready to make and receive calls in Ringee.</p>
        <table style="border-collapse:collapse;margin:12px 0;">
          <tr><td style="padding:4px 12px;color:#737373;">Phone number</td><td style="padding:4px 12px;"><strong>${escapeHtml(number.phoneNumber)}</strong></td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Country</td><td style="padding:4px 12px;">${escapeHtml(number.isoCountry)} (${escapeHtml(number.phoneNumberType ?? "local")})</td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Order</td><td style="padding:4px 12px;">${escapeHtml(number.providerOrderId ?? "")}</td></tr>
        </table>
        <p style="margin-top:16px;color:#737373;">Reply to this email if you need anything — the Ringee team is on this thread.</p>
      </div>
    `;
    await this.sendClientEmail(
      number,
      `${number.phoneNumber} is verified and active`,
      html,
    );
  }

  private async sendVerificationRejectedEmail(
    number: NumberPurchased,
    result: NumberOrderRequirements,
    outcome: "rejected" | "expired",
  ): Promise<void> {
    const rejected = result.requirements.filter((r) =>
      /reject|declin|fail/i.test(r.status ?? ""),
    );
    // If the carrier flagged the order but not individual items, show them all.
    const toShow = rejected.length > 0 ? rejected : result.requirements;

    const rows = toShow
      .map(
        (r) => `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;vertical-align:top;"><strong>${escapeHtml(r.name)}</strong></td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;vertical-align:top;">${escapeHtml(r.reason || r.status || "Needs to be corrected and resubmitted")}</td>
        </tr>`,
      )
      .join("");

    const intro =
      outcome === "expired"
        ? `The order for <strong>${escapeHtml(number.phoneNumber)}</strong> expired before verification completed. Please open Ringee to submit the documents again.`
        : `The carrier could not approve the regulatory documents for <strong>${escapeHtml(number.phoneNumber)}</strong>. Please review the items below, correct them, and resubmit from Ringee.`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;max-width:640px;">
        <h2 style="margin:0 0 12px;">Action needed: verification ${outcome === "expired" ? "expired" : "not approved"}</h2>
        <p>${intro}</p>
        <table style="border-collapse:collapse;margin:12px 0;">
          <tr><td style="padding:4px 12px;color:#737373;">Phone number</td><td style="padding:4px 12px;"><strong>${escapeHtml(number.phoneNumber)}</strong></td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Country</td><td style="padding:4px 12px;">${escapeHtml(number.isoCountry)} (${escapeHtml(number.phoneNumberType ?? "local")})</td></tr>
          <tr><td style="padding:4px 12px;color:#737373;">Order</td><td style="padding:4px 12px;">${escapeHtml(number.providerOrderId ?? "")}</td></tr>
        </table>
        <h3 style="margin:16px 0 4px;">${outcome === "expired" ? "Documents to resubmit" : "What needs attention"}</h3>
        <table style="border-collapse:collapse;width:100%;">${rows}</table>
        <p style="margin-top:16px;color:#737373;">Reply to this email if you need help — both the account owner and the Ringee team are on this thread.</p>
      </div>
    `;

    await this.sendClientEmail(
      number,
      outcome === "expired"
        ? `${number.phoneNumber} verification expired — action needed`
        : `${number.phoneNumber} verification not approved — action needed`,
      html,
    );
  }

  /** Sends an email TO the number's owner, CC the internal follow-up inbox. */
  private async sendClientEmail(
    number: NumberPurchased,
    subject: string,
    html: string,
  ): Promise<void> {
    const client = await this.resolveClient(number);
    const recipients = client.email ? [client.email] : [REGULATORY_FOLLOWUP_CC];
    const cc = client.email ? [REGULATORY_FOLLOWUP_CC] : undefined;

    await this.email.sendEmail(
      recipients,
      subject,
      html,
      "Ringee Notifications",
      apiConfiguration.EMAIL_FROM_ADDRESS,
      REGULATORY_FOLLOWUP_CC,
      cc,
    );
  }
}

/**
 * Coarse outcome from a provider order line. Approved when all requirements are
 * met; expired/rejected when the line or any requirement reached a terminal
 * non-approved state; pending otherwise.
 */
function classifyVerification(
  result: NumberOrderRequirements,
): NumberVerificationOutcome {
  if (result.requirementsMet) return "approved";

  const signals = [
    result.requirementsStatus ?? "",
    ...result.requirements.map((r) => r.status ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  if (/cancel|expired/.test(signals)) return "expired";
  if (/reject|declin|fail/.test(signals)) return "rejected";
  return "pending";
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
