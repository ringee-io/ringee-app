/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreditRepository } from "./credit.repository";

describe("CreditRepository.updateBalance", () => {
  it("uses an atomic increment for every debit", async () => {
    const updates: unknown[] = [];
    const prisma = {
      credit: {
        findFirst: async () => ({ id: "credit-1", amount: 100 }),
        update: async (input: unknown) => {
          updates.push(input);
          return { id: "credit-1", amount: 99.75 };
        },
      },
    };
    const repository = new CreditRepository(prisma as never);

    await repository.updateBalance(
      { userId: "00000000-0000-0000-0000-000000000001" },
      -0.25,
    );

    assert.deepEqual(updates, [
      {
        where: { id: "credit-1" },
        data: { amount: { increment: -0.25 } },
      },
    ]);
  });
});
