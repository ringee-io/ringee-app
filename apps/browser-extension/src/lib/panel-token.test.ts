import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageType } from "@ringee/dialer-core/contracts";
import { panelTokenProvider, workerTokenSource } from "./panel-token";
import { RingeeApi } from "./ringee-api";

/** Who the panel shows, and a worker token minted for that same session. */
const SHOWN = { userId: "user_1", orgId: "org_1" };
const shown = () => SHOWN;
const borrowed = (token: string) => ({ token, ...SHOWN });

describe("panelTokenProvider", () => {
  it("uses the panel's own token while it has one", async () => {
    const clerk = vi.fn(async () => "own-token");
    const worker = vi.fn(async () => borrowed("worker-token"));

    await expect(panelTokenProvider(clerk, worker, shown)()).resolves.toBe(
      "own-token",
    );
    expect(worker).not.toHaveBeenCalled();
  });

  it("asks the worker once the panel's own token cannot be renewed", async () => {
    const worker = vi.fn(async () => borrowed("worker-token"));

    await expect(
      panelTokenProvider(async () => null, worker, shown)(),
    ).resolves.toBe("worker-token");
    await expect(
      panelTokenProvider(
        async () => {
          throw new Error("Clerk could not renew the session token");
        },
        worker,
        shown,
      )(),
    ).resolves.toBe("worker-token");
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("goes to the worker first when the API refused the token", async () => {
    const clerk = vi.fn(async () => "own-token");
    const worker = vi.fn(async () => borrowed("worker-token"));

    await expect(
      panelTokenProvider(clerk, worker, shown)({ forceRefresh: true }),
    ).resolves.toBe("worker-token");
    expect(clerk).not.toHaveBeenCalled();
  });

  it("falls back to Clerk's forced refresh when the worker has none", async () => {
    const clerk = vi.fn(async (opts?: { skipCache?: boolean }) =>
      opts?.skipCache ? "refreshed-token" : null,
    );

    await expect(
      panelTokenProvider(clerk, async () => null, shown)(),
    ).resolves.toBe("refreshed-token");
    expect(clerk).toHaveBeenLastCalledWith({ skipCache: true });
  });

  it("answers null when nothing has a token", async () => {
    const provider = panelTokenProvider(
      async () => {
        throw new Error("no session");
      },
      async () => {
        throw new Error("no worker");
      },
      shown,
    );

    await expect(provider()).resolves.toBeNull();
    await expect(provider({ forceRefresh: true })).resolves.toBeNull();
  });

  // The browser's session moved on since the panel loaded: its token would act
  // for someone the panel does not show.
  it("refuses a borrowed token for another user or workspace", async () => {
    const clerk = vi.fn(async (opts?: { skipCache?: boolean }) =>
      opts?.skipCache ? "panel-refreshed-token" : null,
    );
    const others = [
      { token: "t", userId: "user_2", orgId: "org_1" },
      { token: "t", userId: "user_1", orgId: "org_2" },
      { token: "t", userId: "user_1", orgId: null },
      { token: "t" },
    ];

    for (const answer of others) {
      const provider = panelTokenProvider(clerk, async () => answer, shown);
      await expect(provider()).resolves.toBeNull();
      await expect(provider({ forceRefresh: true })).resolves.toBeNull();
    }
    // Nor does it renew the session the browser left.
    expect(clerk).not.toHaveBeenCalledWith({ skipCache: true });
  });

  it("takes a borrowed token in the panel's personal workspace", async () => {
    const provider = panelTokenProvider(
      async () => null,
      async () => ({ token: "worker-token", userId: "user_1", orgId: null }),
      () => ({ userId: "user_1", orgId: undefined }),
    );

    await expect(provider()).resolves.toBe("worker-token");
  });
});

describe("panelTokenProvider with RingeeApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const authOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    (
      (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<
        string,
        string
      >
    ).Authorization;

  it("saves an outcome with the worker's token when the panel's has lapsed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "call-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new RingeeApi(
      panelTokenProvider(
        async () => null,
        async () => borrowed("worker-token"),
        shown,
      ),
    );

    await api.saveCallOutcome({
      callSessionId: "telnyx-session-1",
      outcome: "callback_scheduled",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock, 0)).toBe("Bearer worker-token");
  });

  it("retries a refused request with the worker's token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new RingeeApi(
      panelTokenProvider(
        async () => "expired-token",
        async () => borrowed("worker-token"),
        shown,
      ),
    );

    await expect(api.getCurrentUser()).resolves.toEqual({ id: "u1" });
    expect(authOf(fetchMock, 0)).toBe("Bearer expired-token");
    expect(authOf(fetchMock, 1)).toBe("Bearer worker-token");
  });
});

describe("workerTokenSource", () => {
  it("asks the worker and returns its token, with whose it is", async () => {
    const send = vi.fn(async () => borrowed("worker-token"));

    await expect(workerTokenSource(send)()).resolves.toEqual(
      borrowed("worker-token"),
    );
    expect(send).toHaveBeenCalledWith({ type: MessageType.RequestAuthToken });
  });

  it("shares one request between concurrent callers", async () => {
    let answer: (value: unknown) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          answer = resolve;
        }),
    );
    const token = workerTokenSource(send);

    const first = token();
    const second = token();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    answer(borrowed("worker-token"));

    await expect(Promise.all([first, second])).resolves.toEqual([
      borrowed("worker-token"),
      borrowed("worker-token"),
    ]);
    expect(send).toHaveBeenCalledTimes(1);

    // Settled: the next caller asks again.
    send.mockImplementationOnce(async () => borrowed("next-token"));
    await expect(token()).resolves.toEqual(borrowed("next-token"));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("treats anything but a valid answer as no token", async () => {
    await expect(
      workerTokenSource(async () => undefined)(),
    ).resolves.toBeNull();
    await expect(workerTokenSource(async () => ({}))()).resolves.toBeNull();
    await expect(
      workerTokenSource(async () => ({ token: null }))(),
    ).resolves.toBeNull();
    await expect(
      workerTokenSource(async () => {
        throw new Error("Could not establish connection");
      })(),
    ).resolves.toBeNull();
    await expect(
      workerTokenSource(() => {
        throw new Error("Extension context invalidated");
      })(),
    ).resolves.toBeNull();
  });

  it("stops waiting for a worker that never answers", async () => {
    vi.useFakeTimers();
    try {
      const token = workerTokenSource(() => new Promise(() => {}), 1_000);
      const pending = token();
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
