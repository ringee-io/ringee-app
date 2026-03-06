import { Injectable, BadRequestException } from "@nestjs/common";
import { Credit, CreditRepository } from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

@Injectable()
export class CreditService {
  constructor(private readonly creditRepository: CreditRepository) { }

  async getBalance(ctx: OwnershipContext): Promise<number> {
    return this.creditRepository.getBalance(ctx);
  }

  async addCredits(ctx: OwnershipContext, amount: number): Promise<Credit> {
    if (amount <= 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    return this.creditRepository.updateBalance(ctx, amount);
  }

  async consumeCredits(ctx: OwnershipContext, amount: number): Promise<Credit> {
    if (amount < 0) {
      throw new BadRequestException("The amount must be positive.");
    }

    // const balance = await this.getBalance(ctx);

    // if (balance < amount) {
    //   throw new BadRequestException("Insufficient balance.");
    // }

    return this.creditRepository.updateBalance(ctx, -amount);
  }
}
