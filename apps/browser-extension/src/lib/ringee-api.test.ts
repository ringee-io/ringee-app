import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, RingeeApi, mapStatusToErrorCode } from "./ringee-api";

describe("mapStatusToErrorCode", () => {
  it("maps HTTP statuses to stable prepare-call error codes", () => {
    expect(mapStatusToErrorCode(401)).toBe("UNAUTHENTICATED");
    expect(mapStatusToErrorCode(402)).toBe("INSUFFICIENT_CREDITS");
    expect(mapStatusToErrorCode(403)).toBe("FORBIDDEN");
    expect(mapStatusToErrorCode(409)).toBe("NO_CALLER_ID");
  });

  it("falls back to UNKNOWN for unmapped statuses", () => {
    expect(mapStatusToErrorCode(500)).toBe("UNKNOWN");
    expect(mapStatusToErrorCode(418)).toBe("UNKNOWN");
  });
});

describe("RingeeApi auth retry", () => {
  afterEach(() => vi.unstubAllGlobals());

  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  it("retries once with a force-refreshed token after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));
    vi.stubGlobal("fetch", fetchMock);

    const calls: Array<{ forceRefresh?: boolean } | undefined> = [];
    const api = new RingeeApi(async (opts) => {
      calls.push(opts);
      return opts?.forceRefresh ? "fresh-token" : "stale-token";
    });

    const user = await api.getCurrentUser();

    expect(user).toEqual({ id: "u1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First attempt uses the cached token, the retry forces a refresh.
    expect(calls[0]?.forceRefresh).toBeFalsy();
    expect(calls[1]?.forceRefresh).toBe(true);
    const retryAuth = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(retryAuth.Authorization).toBe("Bearer fresh-token");
  });

  it("surfaces the error when the retry also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { message: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new RingeeApi(async () => "token");

    await expect(api.getCurrentUser()).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("RingeeApi post-call save", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  it("retries the temporary Telnyx webhook resolution race without losing the note", async () => {
    vi.useFakeTimers();
    const longNote = "Seguimiento con contexto detallado 🚀\n".repeat(500);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, {
          message: "callId or callSessionId is required",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new RingeeApi(async () => "token");
    const saving = api.saveCallOutcome({
      callSessionId: "telnyx-session-1",
      outcome: "interested",
      outcomeNote: longNote,
    });

    await vi.runAllTimersAsync();
    await saving;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(retryBody).toMatchObject({
      callSessionId: "telnyx-session-1",
      outcome: "interested",
      outcomeNote: longNote,
    });
  });

  it("sends finalize without an outcome through the same post-call endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new RingeeApi(async () => "token");
    await api.saveCallOutcome({ callSessionId: "telnyx-session-1" });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    expect(body).toEqual({ callSessionId: "telnyx-session-1" });
  });

  it("does not retry unrelated validation errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { message: "invalid outcome" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new RingeeApi(async () => "token");
    await expect(
      api.saveCallOutcome({
        callSessionId: "telnyx-session-1",
        outcome: "interested",
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
