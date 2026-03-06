import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { CallerIdRepository } from "@ringee/database";
import { TelephonyService, OwnershipContext } from "@ringee/platform";

@Injectable()
export class CallerIdService {
  constructor(
    private readonly repo: CallerIdRepository,
    private readonly telephonyService: TelephonyService,
  ) { }

  async requestVerification(
    ctx: OwnershipContext,
    phoneNumber: string,
    method: "sms" | "call",
    extension?: string,
  ) {
    const existing = await this.repo.findByPhone(ctx, phoneNumber);

    const isPending = existing?.status === "pending";

    if (isPending) {
      await this.telephonyService.requestCallIdVerification(
        phoneNumber,
        method,
        extension,
      );

      return existing;
    }

    if (existing && existing.status === "verified") {
      throw new BadRequestException("Caller ID already verified");
    }

    const callerId = await this.repo.create(ctx, {
      phoneNumber,
      provider: "telnyx",
      status: "pending",
    });

    await this.telephonyService.requestCallIdVerification(
      phoneNumber,
      method,
      extension,
    );

    return callerId;
  }

  async getCallerIds(ctx: OwnershipContext) {
    return this.repo.listByOwner(ctx);
  }

  async verifyCallerId(id: string, verificationCode: string) {
    const callerId = await this.repo.findById(id);

    if (!callerId) {
      throw new NotFoundException("Caller ID not found");
    }

    if (callerId.verified) {
      throw new BadRequestException("Caller ID already verified");
    }

    const { isVerified } =
      await this.telephonyService.submitCallIdVerificationCode(
        callerId.phoneNumber,
        verificationCode,
      );

    if (isVerified) {
      // TODO: assign number to connection
      // await this.telephonyService.assignNumberToConnection('+18495322320');
      return this.repo.markVerified(id);
    }

    throw new BadRequestException("Caller ID verification failed");
  }

  async failVerification(id: string, reason?: string) {
    const callerId = await this.repo.findById(id);
    if (!callerId) {
      throw new NotFoundException("Caller ID not found");
    }

    return this.repo.markFailed(id, reason);
  }

  async removeCallerId(id: string, permanent = false) {
    const callerId = await this.repo.findById(id);
    if (!callerId) {
      throw new NotFoundException("Caller ID not found");
    }

    return permanent
      ? this.repo.deletePermanently(id)
      : this.repo.softDelete(id);
  }
}
