import { describe, expect, it } from "vitest";
import {
  RingeeManagedAccountResolver,
  accountSlot,
  providerAccount,
} from "./provider-account";

describe("provider account identity", () => {
  it("names the billing account, so every credential of it shares one budget", () => {
    const a = new RingeeManagedAccountResolver("ringee-managed").resolve();
    const b = new RingeeManagedAccountResolver("Ringee-Managed").resolve();
    expect(accountSlot(a)).toBe(accountSlot(b));
  });

  it("gives another billing account a budget of its own", () => {
    const ringee = providerAccount("telnyx", "ringee-managed");
    const customer = providerAccount(
      "telnyx",
      "0f6b3c2e-7d1a-4c35-9b1e-2a4f8d6c1e90",
    );
    expect(accountSlot(ringee)).not.toBe(accountSlot(customer));
  });

  it("gives another carrier a budget of its own, even with the same reference", () => {
    expect(accountSlot(providerAccount("telnyx", "main"))).not.toBe(
      accountSlot(providerAccount("twilio", "main")),
    );
  });

  it("builds keys that cannot break out of the account's hash tag", () => {
    const slot = accountSlot(providerAccount("telnyx", "a{b}:c d/e"));
    expect(slot).not.toMatch(/[{}:\s/]/);
  });

  it.each([
    "KEY0191ABCDEF1234567890_abcdefghijklmnopqrstuv",
    "sk_live_51Habcdef",
    "Bearer abc.def.ghi",
    "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "  key0191abcdef1234567890_secret  ",
  ])("refuses a credential as a reference (%s)", (credential) => {
    expect(() => providerAccount("telnyx", credential)).toThrow(/credential/);
  });

  it("never lets the credential reach the slot, the key or a log line", () => {
    const secret = "KEY019ABCDEF0123456789_supersecretvalue";
    let leaked = false;
    try {
      providerAccount("telnyx", secret);
    } catch (error) {
      leaked = String((error as Error).message).includes(secret);
    }
    expect(leaked).toBe(false);
  });

  it("refuses an empty reference", () => {
    expect(() => providerAccount("telnyx", "   ")).toThrow(/empty/);
  });
});
