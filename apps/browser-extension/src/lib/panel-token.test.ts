import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageType } from "@ringee/dialer-core/contracts";
import { panelTokenProvider, workerTokenSource } from "./panel-token";
import { RingeeApi } from "./ringee-api";

describe("panelTokenProvider", () => {
  it("uses the panel's own token while it has one", async () => {
    const clerk = vi.fn(async () => "own-token");
    const worker = vi.fn(async () => "worker-token");

    await expect(panelTokenProvider(clerk, worker)()).resolves.toBe(
      "own-token",
    );
    expect(worker).not.toHaveBeenCalled();
  });

  it("asks the worker once the panel's own token cannot be renewed", async () => {
    const worker = vi.fn(async () => "worker-token");

    await expect(panelTokenProvider(async () => null, worker)()).resolves.toBe(
      "worker-token",
    );
    await expect(
      panelTokenProvider(async () => {
        throw new Error("Clerk could not renew the session token");
      }, worker)(),
    ).resolves.toBe("worker-token");
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("goes to the worker first when the API refused the token", async () => {
    const clerk = vi.fn(async () => "own-token");
    const worker = vi.fn(async () => "worker-token");

    await expect(
      panelTokenProvider(clerk, worker)({ forceRefresh: true }),
    ).resolves.toBe("worker-token");
    expect(clerk).not.toHaveBeenCalled();
  });

  it("falls back to Clerk's forced refresh when the worker has none", async () => {
    const clerk = vi.fn(async (opts?: { skipCache?: boolean }) =>
      opts?.skipCache ? "refreshed-token" : null,
    );

    await expect(panelTokenProvider(clerk, async () => null)()).resolves.toBe(
      "refreshed-token",
    );
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
    );

    await expect(provider()).resolves.toBeNull();
    await expect(provider({ forceRefresh: true })).resolves.toBeNull();
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
        async () => "worker-token",
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
        async () => "worker-token",
      ),
    );

    await expect(api.getCurrentUser()).resolves.toEqual({ id: "u1" });
    expect(authOf(fetchMock, 0)).toBe("Bearer expired-token");
    expect(authOf(fetchMock, 1)).toBe("Bearer worker-token");
  });
});

describe("workerTokenSource", () => {
  it("asks the worker and returns its token", async () => {
    const send = vi.fn(async () => ({ token: "worker-token" }));

    await expect(workerTokenSource(send)()).resolves.toBe("worker-token");
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
    answer({ token: "worker-token" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      "worker-token",
      "worker-token",
    ]);
    expect(send).toHaveBeenCalledTimes(1);

    // Settled: the next caller asks again.
    send.mockImplementationOnce(async () => ({ token: "next-token" }));
    await expect(token()).resolves.toBe("next-token");
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
