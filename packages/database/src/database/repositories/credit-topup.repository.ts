import { Injectable } from "@nestjs/common";
import { CreditTopup } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class CreditTopupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads of the `CreditTopup` ledger.
   *
   * WRITES live in `CreditRepository.topupOnce`, which records the row and
   * moves the balance in one transaction. There is deliberately no write path
   * here: a method that records a top-up without crediting the balance can
   * leave a customer paid-but-not-credited, and the Stripe replay that would
   * repair it sees the row and skips the credit (BILL-003).
   */
  async findByCheckoutSessionId(
    stripeCheckoutSessionId: string,
  ): Promise<CreditTopup | null> {
    return this.prisma.creditTopup.findUnique({
      where: { stripeCheckoutSessionId },
    });
  }
}
