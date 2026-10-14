import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResendProvider } from "./resend.provider";

// The adapter builds its client when the module loads, so the mocks exist first.
const { send, get } = vi.hoisted(() => ({ send: vi.fn(), get: vi.fn() }));

vi.mock("@ringee/configuration", () => ({
  apiConfiguration: {
    RESEND_API_KEY: "re_test",
    EMAIL_FROM_NAME: "Ringee",
    EMAIL_FROM_ADDRESS: "hello@notifications.ringee.io",
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send, get };
  },
}));

/**
 * The explicit send path the meeting confirmation relies on (AGENT-020): it
 * applies exactly the Reply-To, CC and headers it is given — the legacy
 * `sendEmail` substitutes its own Reply-To — and says plainly whether the
 * provider took the email and whether trying again could help.
 */
describe("ResendProvider.send", () => {
  beforeEach(() => {
    send.mockReset();
    get.mockReset();
  });

  it("sends exactly the reply-to, copies and thread headers it is given", async () => {
    send.mockResolvedValue({ data: { id: "re_1" }, error: null });

    const result = await new ResendProvider().send({
      to: ["lead@acme.test", "member@acme.test"],
      cc: ["admin@acme.test"],
      subject: "Confirmed",
      html: "<p>ok</p>",
      text: "ok",
      fromName: "Acme via Ringee",
      replyTo: "member@acme.test",
      headers: { "In-Reply-To": "<a@b>", References: "<a@b>" },
      idempotencyKey: "delivery-1",
    });

    expect(result).toEqual({ accepted: true, providerEmailId: "re_1" });
    expect(send).toHaveBeenCalledWith(
      {
        from: "Acme via Ringee <hello@notifications.ringee.io>",
        to: ["lead@acme.test", "member@acme.test"],
        cc: ["admin@acme.test"],
        subject: "Confirmed",
        html: "<p>ok</p>",
        text: "ok",
        replyTo: "member@acme.test",
        headers: { "In-Reply-To": "<a@b>", References: "<a@b>" },
      },
      { idempotencyKey: "delivery-1" },
    );
  });

  it("tells a refusal worth retrying from one that will fail the same way", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "rate_limit_exceeded", message: "slow down" },
    });
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "bad address" },
    });
    const provider = new ResendProvider();
    const message = { to: ["x@y.test"], subject: "s", html: "h" };

    expect(await provider.send(message)).toMatchObject({
      accepted: false,
      retryable: true,
    });
    expect(await provider.send(message)).toMatchObject({
      accepted: false,
      retryable: false,
    });
  });

  it("treats a transport failure as unknown, so it is retried under the same key", async () => {
    send.mockRejectedValue(new Error("socket hang up"));
    expect(
      await new ResendProvider().send({
        to: ["x@y.test"],
        subject: "s",
        html: "h",
      }),
    ).toEqual({ accepted: false, error: "socket hang up", retryable: true });
  });

  it("reads the Message-ID the provider reports, and never guesses one", async () => {
    get.mockResolvedValueOnce({
      data: { id: "re_1", message_id: "<m-1@resend.test>" },
      error: null,
    });
    get.mockResolvedValueOnce({ data: { id: "re_2" }, error: null });
    const provider = new ResendProvider();
    expect(await provider.getMessageId("re_1")).toBe("<m-1@resend.test>");
    expect(await provider.getMessageId("re_2")).toBeNull();
  });
});
