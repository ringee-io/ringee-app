import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { NumberPurchased, NumberPurchasedRepository } from "@ringee/database";
import { TelephonyService, CostInformation, OwnershipContext } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";

@Injectable()
export class NumberPurchasedService {
  private readonly logger = new Logger(NumberPurchasedService.name);

  constructor(
    private readonly numberPurchasedRepository: NumberPurchasedRepository,
    private telephonyService: TelephonyService,
  ) { }

  release(id: string): Promise<NumberPurchased> {
    return this.numberPurchasedRepository.release(id);
  }

  assignToOwner(numberId: string, ctx: OwnershipContext): Promise<NumberPurchased> {
    return this.numberPurchasedRepository.assignToOwner(numberId, ctx);
  }

  findByOwner(ctx: OwnershipContext): Promise<NumberPurchased[]> {
    return this.numberPurchasedRepository.findByOwner(ctx);
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
    const number = await this.numberPurchasedRepository.findById(numberPurchasedId);
    if (!number) throw new NotFoundException("Number not found");

    let features: { sms?: boolean; mms?: boolean; voice?: boolean; raw?: any } = {};
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
        messagingEnabled,
        providerMessagingProfileId: profileId,
        messagingStatus: messagingEnabled ? "ready" : "unavailable",
        messagingError: null,
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

  async buyNumber(
    ctx: OwnershipContext,
    numberId: string,
    costInformation: CostInformation,
  ): Promise<NumberPurchased> {
    const purchase = await this.telephonyService.purchaseNumbers([numberId]);
    const phoneNumber = purchase.phoneNumbers[0]!;

    const numbers = await this.numberPurchasedRepository.findByOwner(ctx);

    const foundPrimaryNumber = numbers.find((number) => {
      const primaryNumber = number.userNumbers?.find(
        (userNumber) => userNumber.isPrimary,
      );

      return primaryNumber !== undefined;
    });

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
        sms: false,
        voice: true,
        fax: false,
        hdVoice: true,
        internationalSms: false,
        emergency: false,
        mms: false,
      },
    });

    // Best-effort: hydrate messaging capabilities right after purchase so
    // the inbox can immediately allow SMS/MMS where supported.
    void this.refreshMessagingCapabilities(created.id).catch((err) => {
      this.logger.warn(
        `Initial messaging hydration failed for ${created.phoneNumber}: ${(err as Error).message}`,
      );
    });

    return created;
  }
}
