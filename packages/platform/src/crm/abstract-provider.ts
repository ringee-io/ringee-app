import { Logger } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { CrmError } from "./errors";
import type { CrmProvider } from "./provider";
import type {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmCredentials,
  CrmExchangeParams,
  CrmListRef,
  CrmNoteInput,
  CrmOwnerRef,
  CrmPersonInput,
  CrmRecordMatch,
  CrmRecordRef,
  CrmTaskInput,
  CrmTokenSet,
  CrmWorkspaceInfo,
} from "./types";

export type CrmHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
};

export abstract class AbstractCrmProvider implements CrmProvider {
  protected readonly logger: Logger;

  abstract readonly type: CrmProviderType;
  abstract readonly capabilities: CrmCapabilities;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  abstract getAuthorizationUrl(params: CrmAuthorizeParams): string;
  abstract exchangeCode(params: CrmExchangeParams): Promise<CrmTokenSet>;
  abstract refreshToken(refreshToken: string): Promise<CrmTokenSet>;
  abstract getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo>;
  abstract searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts?: { limit?: number },
  ): Promise<CrmRecordMatch[]>;
  abstract upsertPerson(creds: CrmCredentials, input: CrmPersonInput): Promise<CrmRecordRef>;
  abstract logCall(creds: CrmCredentials, input: CrmCallLogInput): Promise<CrmRecordRef>;
  abstract addNote(creds: CrmCredentials, input: CrmNoteInput): Promise<CrmRecordRef>;

  upsertCompany?(creds: CrmCredentials, input: CrmCompanyInput): Promise<CrmRecordRef>;
  createTask?(creds: CrmCredentials, input: CrmTaskInput): Promise<CrmRecordRef>;
  revoke?(token: string): Promise<void>;
  searchByEmail?(creds: CrmCredentials, email: string, opts?: { limit?: number }): Promise<CrmRecordMatch[]>;
  searchCompanyByDomain?(creds: CrmCredentials, domain: string): Promise<CrmCompanyMatch[]>;
  fetchPerson?(creds: CrmCredentials, externalId: string): Promise<CrmContactSyncResult>;
  fetchCompany?(creds: CrmCredentials, externalId: string): Promise<CrmCompanySyncResult>;
  listLists?(creds: CrmCredentials): Promise<CrmListRef[]>;
  listMembers?(creds: CrmCredentials): Promise<CrmOwnerRef[]>;

  protected async request<T>(req: CrmHttpRequest): Promise<T> {
    const timeoutMs = req.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = this.buildUrl(req.url, req.query);
    const init: RequestInit = {
      method: req.method,
      headers: {
        "User-Agent": "ringee/1.0",
        Accept: "application/json",
        ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
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
        throw new CrmError("TRANSIENT", true, `timeout after ${timeoutMs}ms`);
      }
      throw new CrmError("TRANSIENT", true, `network error: ${message}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      let parsed: unknown = undefined;
      try {
        parsed = await res.json();
      } catch {
        parsed = await res.text().catch(() => undefined);
      }
      throw this.classifyHttpError(res.status, parsed, res.headers.get("retry-after"));
    }

    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  /**
   * Maps an HTTP error response to a `CrmError` with the correct code and
   * retryability. The default implementation uses generic HTTP status rules
   * (401 → AUTH_EXPIRED, 403 → AUTH_REVOKED, 4xx → VALIDATION, 5xx → TRANSIENT).
   *
   * Subclasses should override this when the provider's error semantics
   * differ from pure HTTP status codes — for example, HubSpot signals
   * revocation with `category: "EXPIRED_AUTHENTICATION"` in the body of a
   * 401, and Salesforce uses `errorCode: "INVALID_SESSION_ID"` in its own
   * shape. Inspecting `body` lets each provider distinguish "token expired
   * (refresh will fix it)" from "app revoked (give up)".
   */
  protected classifyHttpError(
    status: number,
    body?: unknown,
    retryAfter?: string | null,
  ): CrmError {
    return CrmError.fromHttp(status, body, retryAfter);
  }

  /**
   * Whether a failure during `refreshToken()` should be treated as a terminal
   * revocation (connection marked `revoked`, no more retries) rather than a
   * transient error. Default: any AUTH_* or VALIDATION error from the refresh
   * endpoint means the refresh token itself is no longer accepted.
   *
   * Override for providers whose refresh endpoint returns ambiguous errors —
   * e.g., HubSpot returns 400 with `error: "invalid_grant"` on revoked refresh
   * tokens but also on transient issues; Salesforce returns 400 with
   * `error: "invalid_grant" / "expired access/refresh token"`.
   */
  isRefreshFailureTerminal(err: CrmError): boolean {
    return (
      err.code === "AUTH_REVOKED" ||
      err.code === "AUTH_EXPIRED" ||
      err.code === "VALIDATION"
    );
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

  protected authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }
}
