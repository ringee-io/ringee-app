import { afterEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "crypto";
import { deriveSdkKey } from "./secrets";

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, scryptSync: vi.fn(actual.scryptSync) };
});

const previous = process.env.SDK_SIGNING_SECRET;
afterEach(() => {
  if (previous === undefined) delete process.env.SDK_SIGNING_SECRET;
  else process.env.SDK_SIGNING_SECRET = previous;
  vi.clearAllMocks();
});

describe("SDK key derivation cache", () => {
  it("keeps the existing key format and runs scrypt once per purpose", () => {
    process.env.SDK_SIGNING_SECRET = "cache-regression-secret";
    const expected = scryptSync(
      "cache-regression-secret",
      "ringee_sse_ticket_v1",
      32,
    );
    vi.mocked(scryptSync).mockClear();
    for (let i = 0; i < 100; i++)
      expect(deriveSdkKey("sse_ticket")).toEqual(expected);
    expect(scryptSync).toHaveBeenCalledTimes(1);
    deriveSdkKey("dial_authorization");
    expect(scryptSync).toHaveBeenCalledTimes(2);
  });

  it("invalidates on secret rotation and protects cached keys from mutation", () => {
    process.env.SDK_SIGNING_SECRET = "before-rotation";
    const first = deriveSdkKey("sse_ticket");
    const copy = Buffer.from(first);
    first.fill(0);
    expect(deriveSdkKey("sse_ticket")).toEqual(copy);
    process.env.SDK_SIGNING_SECRET = "after-rotation";
    expect(deriveSdkKey("sse_ticket")).not.toEqual(copy);
    expect(scryptSync).toHaveBeenCalledTimes(2);
  });
});
