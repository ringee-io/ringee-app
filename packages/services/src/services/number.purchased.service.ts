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
    const profileId =
      providerFeatures.raw?.messaging_profile_id ??
      apiConfiguration.TELNYX_MESSAGING_PROFILE_ID ??
      null;

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
      messagingStatus: messagingEnabled ? "ready" : "unavailable",
    });

    return created;
  }
}
