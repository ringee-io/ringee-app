import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import axios, { AxiosInstance } from "axios";
import { uacErrorDiagnostics } from "./telnyx.uac";
import { describeTelnyxError, sanitizeMediaStreamError } from "./telnyx.error";
import { ProviderDispatchService } from "../dispatch/provider-dispatch.service";
import {
  CallOriginationUncertainError,
  ProviderDispatchDeferredError,
} from "../dispatch/dispatch.types";
import { isCallOriginatingRequest } from "../dispatch/egress-paths";

const TELNYX_ORIGIN = "https://api.telnyx.com";
const TELNYX_BASE_PATH = "/v2";
const TELNYX_BASE_URL = `${TELNYX_ORIGIN}${TELNYX_BASE_PATH}`;

/** A `.` or `..` path segment, literal or percent-encoded (`%2e`). */
const DOT_SEGMENT = /(^|\/)(\.|%2e){1,2}(\/|$)/i;

/**
 * The request URL for a Telnyx API path. Paths carry ids from webhooks and
 * user records, so the URL is always built on the fixed Telnyx origin — never
 * handed to axios as a relative path it could resolve elsewhere — and a path
 * that is not a plain absolute path on that origin is refused outright.
 *
 * `encodeURIComponent` leaves `.` and `..` intact, so an id alone could walk
 * the path out of the endpoint it was meant for (`/uac_connections/..`) and
 * reach another Telnyx API with our key. Dot segments are refused, and the
 * resolved URL must still sit on the Telnyx origin under the API base path.
 */
function apiUrl(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (
    !/^\/(?![/\\])[^\s\\]*$/.test(path) ||
    path.includes("://") ||
    DOT_SEGMENT.test(pathname)
  ) {
    throw invalidPath();
  }
  const href = `${TELNYX_BASE_URL}${path}`;
  const url = new URL(href);
  if (
    url.origin !== TELNYX_ORIGIN ||
    !url.pathname.startsWith(`${TELNYX_BASE_PATH}/`)
  ) {
    throw invalidPath();
  }
  return href;
}

function invalidPath(): HttpException {
  return new HttpException(
    "Invalid telephony provider path",
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Whether a failed request carries Telnyx's own refusal, which proves no call
 * was created: a 4xx answer, or a request refused here before it was sent.
 * Anything else — no response, a 5xx — says nothing either way.
 */
function providerAnswered(error: unknown): boolean {
  if (error instanceof HttpException) return true;
  const status = (error as { response?: { status?: unknown } } | null)?.response
    ?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

@Injectable()
export class TelnyxClient {
  private readonly client: AxiosInstance;

  /**
   * `dispatch` is optional only so a script or a test can build a client alone;
   * every Nest application gets the service from `DispatchModule`.
   */
  constructor(@Optional() private readonly dispatch?: ProviderDispatchService) {
    this.client = axios.create({
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfiguration.TELNYX_API_KEY}`,
      },
    });
  }

  private readonly logger = new Logger(TelnyxClient.name);

  /**
   * Rethrows the provider's own body so `describeTelnyxError` can read it, and
   * logs which request produced it.
   *
   * The body alone does not say what was called: Telnyx answers a wrong path,
   * a missing resource and a stale id with the same sentence, so an error
   * stored on a row ("The requested resource or URL could not be found.") is
   * unattributable without this line.
   */
  private handleError(
    error: any,
    method: string,
    path: string,
    body?: unknown,
  ): never {
    if (path.endsWith("/actions/streaming_start")) {
      const safeError = sanitizeMediaStreamError(error);
      this.logger.warn(
        `${method} ${path} failed: ${describeTelnyxError(safeError, "Media streaming failed")}`,
      );
      throw safeError;
    }
    // A path `apiUrl` refused never reached Telnyx: keep its 400 as-is.
    if (error instanceof HttpException) throw error;
    const status = error.response?.status;
    // SIP Attach requests carry SIP passwords and Telnyx echoes rejected
    // values: log each error's code, title, detail and field pointer with
    // everything that was sent as a secret redacted — never the raw body.
    if (path.startsWith("/uac_connections")) {
      this.logger.warn(
        `${method} ${path.split("?", 1)[0]} failed status=${status ?? "unavailable"} errors=${JSON.stringify(
          uacErrorDiagnostics(error.response?.data, body),
        )}`,
      );
      throw new HttpException(
        "Carrier provider request failed",
        status || HttpStatus.BAD_GATEWAY,
      );
    }
    this.logger.warn(
      `${method} ${path} failed${status ? ` with ${status}` : ""}: ${JSON.stringify(
        error.response?.data ?? error.message,
      ).slice(0, 500)}`,
    );
    throw new HttpException(
      error.response?.data || error.message,
      status || HttpStatus.BAD_GATEWAY,
    );
  }

  /**
   * `handleError`, and one thing more for a request that starts a call: when
   * Telnyx did not answer with a refusal — no response at all (a timeout, a
   * dropped connection) or a 5xx — the call may exist, so it is rethrown as
   * `CallOriginationUncertainError` rather than as a dial that failed. Status
   * and body stay what they were.
   */
  private rethrow(
    error: unknown,
    method: string,
    path: string,
    body?: unknown,
  ): never {
    try {
      this.handleError(error, method, path, body);
    } catch (mapped) {
      if (
        mapped instanceof HttpException &&
        isCallOriginatingRequest(method, path, body) &&
        !providerAnswered(error)
      )
        throw new CallOriginationUncertainError(mapped);
      throw mapped;
    }
  }

  private uacOptions(path: string) {
    return path.startsWith("/uac_connections") ||
      path.startsWith("/sip_registration_status")
      ? { timeout: 15_000, maxRedirects: 0 }
      : {};
  }

  private beginEgress(path: string, body?: unknown) {
    if (!this.dispatch && isCallOriginatingRequest("POST", path, body)) {
      throw new ProviderDispatchDeferredError(
        "coordination_unavailable",
        1_000,
      );
    }
    return this.dispatch?.beginEgress("POST", path, body);
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    // A request that starts a call spends outbound capacity (CPS-001). This is
    // the one egress every call-creating request passes through, so no caller
    // can skip the shared pacing. It throws, before anything is sent, when an
    // automated request finds none; the 429 is the caller's to handle and is
    // not a provider error, so it stays outside `handleError`.
    const url = apiUrl(path);
    const egress = await this.beginEgress(path, body);
    try {
      const { data } = await this.client.post<T>(url, body, {
        timeout: 30_000,
        maxRedirects: 0,
        ...this.uacOptions(path),
      });
      egress?.accepted();
      return data;
    } catch (error) {
      egress?.failed(error);
      this.rethrow(error, "POST", path, body);
    }
  }

  async get<T = any>(path: string): Promise<T> {
    try {
      const { data } = await this.client.get<T>(
        apiUrl(path),
        this.uacOptions(path),
      );
      return data;
    } catch (error) {
      this.handleError(error, "GET", path);
    }
  }

  /**
   * GETs and returns the body verbatim. The shared instance asks for JSON, but
   * Telnyx answers `/pricing` with CSV whatever the `Accept` header says — so
   * the caller, not axios, decides how to read it.
   */
  async getText(path: string): Promise<string> {
    try {
      const { data } = await this.client.get<string>(apiUrl(path), {
        responseType: "text",
        transformResponse: [(body: unknown) => body],
        headers: { Accept: "text/csv, text/plain, */*" },
      });
      return data;
    } catch (error) {
      this.handleError(error, "GET", path);
    }
  }

  async put<T = any>(path: string, body?: any): Promise<T> {
    try {
      const { data } = await this.client.put<T>(apiUrl(path), body);
      return data;
    } catch (error) {
      this.handleError(error, "PUT", path, body);
    }
  }

  async patch<T = any>(path: string, body?: any): Promise<T> {
    try {
      const { data } = await this.client.patch<T>(
        apiUrl(path),
        body,
        this.uacOptions(path),
      );
      return data;
    } catch (error) {
      this.handleError(error, "PATCH", path, body);
    }
  }

  /**
   * POSTs and returns raw bytes. The shared instance asks for JSON, so audio
   * endpoints (text-to-speech) need their own response type.
   */
  async postBinary(
    path: string,
    body?: any,
  ): Promise<{ data: Buffer; contentType: string }> {
    const url = apiUrl(path);
    const egress = await this.beginEgress(path, body);
    try {
      const response = await this.client.post(url, body, {
        responseType: "arraybuffer",
        headers: { Accept: "*/*" },
        timeout: 30_000,
        maxRedirects: 0,
      });
      egress?.accepted();
      return {
        data: Buffer.from(response.data as ArrayBuffer),
        contentType:
          (response.headers?.["content-type"] as string | undefined) ??
          "application/octet-stream",
      };
    } catch (error) {
      egress?.failed(error);
      this.rethrow(error, "POST", path, body);
    }
  }

  async delete<T = any>(path: string): Promise<T> {
    try {
      const { data } = await this.client.delete<T>(
        apiUrl(path),
        this.uacOptions(path),
      );
      return data;
    } catch (error) {
      this.handleError(error, "DELETE", path);
    }
  }

  /**
   * Uploads a file as multipart/form-data. The shared axios instance forces
   * `Content-Type: application/json`, so this uses fetch with a native FormData
   * boundary instead.
   */
  async uploadFile<T = any>(
    path: string,
    file: { buffer: Buffer; filename: string; contentType: string },
    fields: Record<string, string> = {},
    options: { fieldName?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    const url = apiUrl(path);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append(
      options.fieldName ?? "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename,
    );

    const egress = await this.beginEgress(path, fields);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${apiConfiguration.TELNYX_API_KEY}`,
        },
        body: form,
        ...(options.timeoutMs
          ? { signal: AbortSignal.timeout(options.timeoutMs) }
          : {}),
      });
    } catch (error) {
      egress?.failed(error);
      this.rethrow(error, "POST", path, fields);
    }

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      egress?.failed({ status: res.status });
      const refused = new HttpException(
        json,
        res.status || HttpStatus.BAD_GATEWAY,
      );
      throw isCallOriginatingRequest("POST", path, fields) &&
        !providerAnswered({ response: { status: res.status } })
        ? new CallOriginationUncertainError(refused)
        : refused;
    }

    egress?.accepted();

    return json;
  }

  async download(path: string): Promise<ArrayBuffer> {
    try {
      const fetchResponse = await fetch(path);

      if (!fetchResponse.ok) {
        throw new Error(`HTTP error! status: ${fetchResponse.status}`);
      }

      const blob = await fetchResponse.arrayBuffer();

      return blob;
    } catch (error) {
      this.handleError(error, "GET", path);
    }
  }
}
