import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { NumberPurchased, NumberPurchasedRepository } from "@ringee/database";
import { TelephonyService, OwnershipContext } from "@ringee/platform";
import { CreditService } from "./credit.service";

const E164 = /^\+[1-9]\d{6,14}$/;
const DEFAULT_VERIFICATION_FEE = 1.0;

/**
 * Manages verified caller IDs — external numbers a user owns elsewhere and
 * verifies through Telnyx so they can be used as the outbound caller ID. Caller
 * IDs live in the `NumberPurchased` table (kind = "verified_caller_id"); see the
 * repository's caller-id methods.
 *
 * Each verification *sent* is billed the Telnyx verification fee
 * (`CALLER_ID_VERIFICATION_FEE`, default $1.00); a user without enough credit
 * cannot request a verification.
 */
@Injectable()
export class CallerIdService {
  private readonly logger = new Logger(CallerIdService.name);

  constructor(
    private readonly repo: NumberPurchasedRepository,
    private readonly telephonyService: TelephonyService,
    private readonly creditService: CreditService,
  ) {}

  /** The flat fee charged per verification sent (covers Telnyx base + channel). */
  getVerificationFee(): number {
    const raw = process.env.CALLER_ID_VERIFICATION_FEE;
    const fee = raw ? parseFloat(raw) : DEFAULT_VERIFICATION_FEE;
    return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_VERIFICATION_FEE;
  }

  async getCallerIds(ctx: OwnershipContext): Promise<NumberPurchased[]> {
    return this.repo.listCallerIds(ctx);
  }

  async requestVerification(
    ctx: OwnershipContext,
    phoneNumber: string,
    method: "sms" | "call",
    extension?: string,
    isoCountry?: string,
  ): Promise<NumberPurchased> {
    if (!E164.test(phoneNumber)) {
      throw new BadRequestException("A valid E.164 phone number is required");
    }

    const existing = await this.repo.findCallerIdByPhone(ctx, phoneNumber);
    if (existing?.verified) {
      throw new BadRequestException("Caller ID already verified");
    }

    // Billing gate: a user without enough credit cannot verify a caller ID.
    const fee = this.getVerificationFee();
    const balance = await this.creditService.getBalance(ctx);
    if (balance < fee) {
      throw new HttpException(
        `Not enough credits. Verifying a caller ID costs $${fee.toFixed(2)}.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Upsert the pending caller-id row before charging so a charge always has a
    // record to attach to.
    const callerId = existing
      ? await this.repo.updateCallerId(existing.id, {
          verificationStatus: "pending",
          verificationMethod: method,
          verificationRequestedAt: new Date(),
        })
      : await this.repo.createCallerId(ctx, {
          phoneNumber,
          isoCountry: isoCountry || "XX",
          provider: "telnyx",
          status: null,
          verificationStatus: "pending",
          verificationMethod: method,
          verificationRequestedAt: new Date(),
        });

    // Charge the fee, then dispatch the verification. Refund if Telnyx rejects
    // the request so a failed send never costs the user.
    await this.creditService.consumeCredits(ctx, fee);
    try {
      await this.telephonyService.requestCallIdVerification(
        phoneNumber,
        method,
        extension,
      );
    } catch (err) {
      await this.creditService
        .addCredits(ctx, fee)
        .catch((refundErr) =>
          this.logger.error(
            `Failed to refund caller-id verification fee for ${phoneNumber}`,
            refundErr,
          ),
        );
      await this.repo.markCallerIdFailed(callerId.id).catch(() => undefined);
      throw err;
    }

    return this.repo.updateCallerId(callerId.id, { verificationFee: fee });
  }

  async verifyCallerId(
    ctx: OwnershipContext,
    id: string,
    verificationCode: string,
  ): Promise<NumberPurchased> {
    const callerId = await this.getOwnedCallerId(ctx, id);

    if (callerId.verified) {
      throw new BadRequestException("Caller ID already verified");
    }

    const { isVerified } =
      await this.telephonyService.submitCallIdVerificationCode(
        callerId.phoneNumber,
        verificationCode,
      );

    if (isVerified) {
      return this.repo.markCallerIdVerified(id);
    }

    await this.repo.markCallerIdFailed(id).catch(() => undefined);
    throw new BadRequestException("Caller ID verification failed");
  }

  async setActive(
    ctx: OwnershipContext,
    id: string,
    active: boolean,
  ): Promise<NumberPurchased> {
    const callerId = await this.getOwnedCallerId(ctx, id);

    if (active && !callerId.verified) {
      throw new BadRequestException(
        "Only verified caller IDs can be activated",
      );
    }

    return this.repo.setCallerIdActive(id, active);
  }

  async removeCallerId(
    ctx: OwnershipContext,
    id: string,
  ): Promise<NumberPurchased> {
    const callerId = await this.getOwnedCallerId(ctx, id);

    // Best-effort removal from Telnyx — never block the local delete on the
    // carrier (deleteVerifiedNumber already tolerates a 404).
    await this.telephonyService
      .deleteVerifiedNumber(callerId.phoneNumber)
      .catch((err) =>
        this.logger.warn(
          `Could not delete verified number ${callerId.phoneNumber} from Telnyx: ${err?.message}`,
        ),
      );

    return this.repo.softDeleteCallerId(id);
  }

  /** Loads a caller ID by id and asserts it belongs to the caller's workspace. */
  private async getOwnedCallerId(
    ctx: OwnershipContext,
    id: string,
  ): Promise<NumberPurchased> {
    const callerId = await this.repo.findCallerIdById(id);
    if (!callerId) {
      throw new NotFoundException("Caller ID not found");
    }

    const ownedByWorkspace = ctx.organizationId
      ? callerId.organizationId === ctx.organizationId
      : callerId.userId === ctx.userId && !callerId.organizationId;

    if (!ownedByWorkspace) {
      throw new NotFoundException("Caller ID not found");
    }

    return callerId;
  }
}
