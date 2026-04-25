import { Logger } from "@nestjs/common";
import { EnrichmentProviderType } from "@ringee/database";
import { EnrichmentError } from "./errors";
import type { EnrichmentProvider } from "./provider";
import type {
  EmailVerificationResult,
  EnrichmentAccountInfo,
  EnrichmentCapabilities,
  EnrichmentCreditsInfo,
  EnrichmentCredentials,
  EnrichmentResult,
  EnrichOpts,
  LeadSearchFilters,
  LeadSearchOpts,
  LeadSearchResult,
  NameCompanyInput,
} from "./types";

export type EnrichmentHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
};

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

export abstract class AbstractEnrichmentProvider implements EnrichmentProvider {
  protected readonly logger: Logger;

  abstract readonly type: EnrichmentProviderType;
  abstract readonly capabilities: EnrichmentCapabilities;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  abstract validateCredentials(
    creds: EnrichmentCredentials,
  ): Promise<EnrichmentAccountInfo>;

  getCredits?(creds: EnrichmentCredentials): Promise<EnrichmentCreditsInfo>;
  enrichByEmail?(
    creds: EnrichmentCredentials,
    email: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByDomain?(
    creds: EnrichmentCredentials,
    domain: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByLinkedIn?(
    creds: EnrichmentCredentials,
    url: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByNameCompany?(
    creds: EnrichmentCredentials,
    input: NameCompanyInput,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByPhone?(
    creds: EnrichmentCredentials,
    phone: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  enrichByPersonId?(
    creds: EnrichmentCredentials,
    personId: string,
    opts?: EnrichOpts,
  ): Promise<EnrichmentResult>;
  verifyEmail?(
    creds: EnrichmentCredentials,
    email: string,
  ): Promise<EmailVerificationResult>;
  searchLeads?(
    creds: EnrichmentCredentials,
    filters: LeadSearchFilters,
    opts?: LeadSearchOpts,
  ): Promise<LeadSearchResult>;

  protected async request<T>(req: EnrichmentHttpRequest): Promise<T> {
    const timeoutMs = req.timeoutMs ?? 20_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = this.buildUrl(req.url, req.query);
    const init: RequestInit = {
      method: req.method,
      headers: {
        "User-Agent": "ringee/1.0",
        Accept: "application/json",
        ...(req.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(req.headers ?? {}),
      },
      signal: controller.signal,
    };
    if (req.body !== undefined) init.body = JSON.stringify(req.body);

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err: unknown) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      if ((err as { name?: string }).name === "AbortError") {
        throw new EnrichmentError(
          "TRANSIENT",
          true,
          `timeout after ${timeoutMs}ms`,
        );
      }
      throw new EnrichmentError("TRANSIENT", true, `network error: ${message}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      let parsed: unknown = undefined;
      try {
        parsed = await res.json();
      } catch {
        parsed = await res.text().catch(() => undefined);
      }
      throw this.classifyHttpError(
        res.status,
        parsed,
        res.headers.get("retry-after"),
      );
    }

    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  protected classifyHttpError(
    status: number,
    body?: unknown,
    retryAfter?: string | null,
  ): EnrichmentError {
    return EnrichmentError.fromHttp(status, body, retryAfter);
  }

  /**
   * Per-process token bucket keyed by (providerType, accountId). Honors
   * `capabilities.rateLimit.requestsPerMinute` and a small burst. Single-process
   * only — fine for now since backend and worker each run as one container.
   * Move to Redis if/when sharded.
   */
  protected async acquireToken(accountId: string): Promise<void> {
    const key = `${this.type}:${accountId}`;
    const limit = this.capabilities.rateLimit;
    const now = Date.now();
    const refillPerMs = limit.requestsPerMinute / 60_000;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit.burst, updatedAt: now };
      buckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.updatedAt;
      bucket.tokens = Math.min(
        limit.burst,
        bucket.tokens + elapsed * refillPerMs,
      );
      bucket.updatedAt = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    const waitMs = Math.ceil((1 - bucket.tokens) / refillPerMs);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 5_000)));
    bucket.tokens = 0;
    bucket.updatedAt = Date.now();
  }

  protected buildUrl(
    url: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.append(k, String(v));
    }
    const qs = params.toString();
    if (!qs) return url;
    return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
  }
}
