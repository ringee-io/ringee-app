import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface RingeeMcpClientOptions {
  /** Full MCP SSE URL (see config.buildMcpUrl). */
  url: string;
  /** Optional bearer token sent on every request. */
  apiKey?: string;
  clientName?: string;
  clientVersion?: string;
  /** Extra headers merged into both the SSE stream and POST messages. */
  headers?: Record<string, string>;
}

export interface McpToolResult {
  /** Parsed JSON when the tool returned JSON text, else the raw string. */
  data: unknown;
  /** Raw text content blocks the tool returned. */
  rawText: string;
  isError: boolean;
}

export class RingeeMcpError extends Error {
  constructor(
    message: string,
    readonly tool?: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "RingeeMcpError";
  }
}

/**
 * Thin transport wrapper around the official MCP SDK client. It connects to the
 * Ringee backend's SSE MCP endpoint and forwards tool calls. It holds NO
 * domain logic — it only moves requests/results across the wire.
 */
export class RingeeMcpClient {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  constructor(private readonly opts: RingeeMcpClientOptions) {
    if (!opts.url) {
      throw new RingeeMcpError("RingeeMcpClient requires a url.");
    }
  }

  get url(): string {
    return this.opts.url;
  }

  private buildHeaders(): Record<string, string> | undefined {
    const headers: Record<string, string> = { ...(this.opts.headers ?? {}) };
    if (this.opts.apiKey) {
      headers.Authorization = `Bearer ${this.opts.apiKey}`;
    }
    return Object.keys(headers).length ? headers : undefined;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const headers = this.buildHeaders();
      const transport = new SSEClientTransport(new URL(this.opts.url), {
        // Auth header on the SSE GET stream.
        eventSourceInit: headers
          ? {
              fetch: (input: string | URL | Request, init?: RequestInit) =>
                fetch(input, {
                  ...init,
                  headers: { ...init?.headers, ...headers },
                }),
            }
          : undefined,
        // Auth header on the POST /messages calls.
        requestInit: headers ? { headers } : undefined,
      });

      const client = new Client({
        name: this.opts.clientName ?? "ringee-agent",
        version: this.opts.clientVersion ?? "0.1.0",
      });

      await client.connect(transport);
      this.client = client;
    })();

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    await this.connect();
    const res = await this.client!.listTools();
    return res.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  /**
   * Call an MCP tool by its backend name and parse the result. The Ringee MCP
   * tools return a single text block of JSON; we parse it when possible.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolResult> {
    await this.connect();

    const res = (await this.client!.callTool({
      name,
      arguments: args,
    })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const rawText = (res.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");

    let data: unknown = rawText;
    try {
      data = JSON.parse(rawText);
    } catch {
      /* not JSON — keep the raw string */
    }

    return { data, rawText, isError: Boolean(res.isError) };
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => undefined);
      this.client = null;
    }
  }
}
