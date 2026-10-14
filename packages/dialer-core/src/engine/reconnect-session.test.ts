import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TelnyxRTC } from "@telnyx/webrtc";

/**
 * Drives the real @telnyx/webrtc bundle over a fake socket. What matters here
 * is where the SDK reads its stored reconnect token, which a mocked client
 * cannot show. The SDK captures `WebSocket` when it loads, so the browser
 * globals are stubbed before the engine is imported.
 */

interface Frame {
  id: string;
  method?: string;
  params?: { sessid?: string; reconnection?: boolean };
}

class FakeSocket {
  static readonly created: FakeSocket[] = [];
  readyState = 0;
  readonly sent: Frame[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.created.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Frame);
  }

  /** Closed by the SDK: settles like a browser socket, after the call. */
  close(): void {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code: 1000 }));
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  /** The network drops the socket under a logged-in client. */
  drop(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  login(): Frame | undefined {
    return this.sent.find(
      (frame) => frame.method === "login" || frame.method === "anonymous_login",
    );
  }
}

const tabStorage = new Map<string, string>();
let engine: typeof import("./telnyx-engine");
let PlainTelnyxRTC: typeof TelnyxRTC;
const clients: TelnyxRTC[] = [];

beforeAll(async () => {
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => tabStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void tabStorage.set(key, value),
    removeItem: (key: string) => void tabStorage.delete(key),
  });
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("addEventListener", () => undefined);
  vi.stubGlobal("removeEventListener", () => undefined);
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    visibilityState: "visible",
  });
  for (const level of ["log", "info", "debug", "warn"] as const)
    vi.spyOn(console, level).mockImplementation(() => undefined);
  engine = await import("./telnyx-engine");
  ({ TelnyxRTC: PlainTelnyxRTC } = await import("@telnyx/webrtc"));
});

beforeEach(() => {
  vi.useFakeTimers();
  tabStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(clients.splice(0).map((client) => client.disconnect()));
});

/** Starts connecting a client and returns the socket it opened. */
function connect(client: TelnyxRTC): FakeSocket {
  clients.push(client);
  void client.connect();
  const socket = FakeSocket.created.at(-1);
  if (!socket) throw new Error("The client did not open a socket.");
  return socket;
}

/** Opens the socket and returns the login the client sent on it. */
async function openAndReadLogin(socket: FakeSocket): Promise<Frame> {
  socket.open();
  await vi.advanceTimersByTimeAsync(0);
  const login = socket.login();
  if (!login) throw new Error("The client did not log in.");
  return login;
}

/** The provider accepts the login under `sessid`. */
async function acceptLogin(socket: FakeSocket, sessid: string): Promise<void> {
  const login = socket.login();
  if (!login) throw new Error("The client did not log in.");
  socket.receive({
    jsonrpc: "2.0",
    id: login.id,
    result: { message: "logged in", sessid },
    voice_sdk_id: "voice-sdk-instance",
  });
  await vi.advanceTimersByTimeAsync(0);
}

async function logIn(client: TelnyxRTC, sessid: string): Promise<FakeSocket> {
  const socket = connect(client);
  await openAndReadLogin(socket);
  await acceptLogin(socket, sessid);
  return socket;
}

function lineClient(login: string): TelnyxRTC {
  return engine.createTelnyxClient({ login, password: "password" });
}

describe("Telnyx reconnect session with more than one client in a tab", () => {
  it("is handed to a second client by the SDK on its own (why the guard exists)", async () => {
    await logIn(
      new PlainTelnyxRTC({ login: "shared-line", password: "password" }),
      "session-shared",
    );
    const second = await openAndReadLogin(
      connect(
        new PlainTelnyxRTC({ login: "inbound-endpoint", password: "password" }),
      ),
    );
    expect(second.params).toMatchObject({
      sessid: "session-shared",
      reconnection: true,
    });
  });

  it("is never presented by a client that has not logged in", async () => {
    await logIn(lineClient("shared-line"), "session-shared");
    const second = await openAndReadLogin(
      connect(lineClient("inbound-endpoint")),
    );
    expect(second.params).not.toHaveProperty("sessid");
    expect(second.params?.reconnection).toBe(false);
  });

  it("is not picked up when the other client finishes logging in first", async () => {
    // The dashboard mounts both clients together: the second one's socket is
    // still opening when the first one's login is accepted.
    const sharedSocket = connect(lineClient("shared-line"));
    const endpointSocket = connect(lineClient("inbound-endpoint"));
    await openAndReadLogin(sharedSocket);
    await acceptLogin(sharedSocket, "session-shared");
    const endpoint = await openAndReadLogin(endpointSocket);
    expect(endpoint.params).not.toHaveProperty("sessid");
    expect(endpoint.params?.reconnection).toBe(false);
  });

  it("is not presented by an anonymous AI assistant client", async () => {
    await logIn(lineClient("shared-line"), "session-shared");
    const assistant = await openAndReadLogin(
      connect(
        new engine.SessionScopedTelnyxRTC({
          anonymous_login: {
            target_type: "ai_assistant",
            target_id: "assistant",
          },
        }),
      ),
    );
    expect(assistant.method).toBe("anonymous_login");
    expect(assistant.params).not.toHaveProperty("sessid");
  });

  it("is still used by a client to resume its own session after a drop", async () => {
    const sharedSocket = await logIn(
      lineClient("shared-line"),
      "session-shared",
    );
    await logIn(lineClient("inbound-endpoint"), "session-endpoint");

    sharedSocket.drop();
    await vi.advanceTimersByTimeAsync(2_000);
    const resumed = FakeSocket.created.at(-1);
    expect(resumed).not.toBe(sharedSocket);
    const login = await openAndReadLogin(resumed as FakeSocket);
    expect(login.params).toMatchObject({
      sessid: "session-shared",
      reconnection: true,
    });
  });
});
