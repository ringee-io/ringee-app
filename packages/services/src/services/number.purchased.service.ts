import { Injectable } from "@nestjs/common";
import { NumberPurchased, NumberPurchasedRepository } from "@ringee/database";
import { TelephonyService, CostInformation, OwnershipContext } from "@ringee/platform";

@Injectable()
export class NumberPurchasedService {
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

    return this.numberPurchasedRepository.create(ctx, {
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
  }
}
