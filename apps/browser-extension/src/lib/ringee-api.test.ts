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

describe("RingeeApi Today queue", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  // The extension keeps its own routes: a change to the web app's My day must
  // never reach a published extension, so nothing here calls /my-day.
  it("reads the queue, the day and the lists from the extension's routes", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok({}));
    vi.stubGlobal("fetch", fetchMock);
    const api = new RingeeApi(async () => "token");

    const until = new Date("2026-10-31T03:59:59.999Z");
    await api.getQueue(until);
    await api.getSummary({
      from: new Date("2026-10-30T04:00:00.000Z"),
      to: until,
    });
    await api.listCallLists();
    await api.getListNext("list 1");

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.map((url) => new URL(url).pathname)).toEqual([
      "/api/extension/queue",
      "/api/extension/summary",
      "/api/extension/lists",
      "/api/extension/lists/list%201/next",
    ]);
    expect(new URL(urls[0]).searchParams.get("until")).toBe(
      until.toISOString(),
    );
    expect(urls.some((url) => url.includes("/my-day"))).toBe(false);
  });

  it("skips a list's contact with a POST to the extension's route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ list: {}, next: null }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new RingeeApi(async () => "token");

    await api.skipListEntry("list-1", "entry-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(
      "/api/extension/lists/list-1/entries/entry-1/skip",
    );
    expect((init as RequestInit).method).toBe("POST");
  });
});
