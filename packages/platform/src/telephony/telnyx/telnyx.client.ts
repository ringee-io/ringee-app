import { Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import axios, { AxiosInstance } from "axios";

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

@Injectable()
export class TelnyxClient {
  private readonly client: AxiosInstance;

  constructor() {
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
  private handleError(error: any, method: string, path: string): never {
    // A path `apiUrl` refused never reached Telnyx: keep its 400 as-is.
    if (error instanceof HttpException) throw error;
    const status = error.response?.status;
    // SIP Attach responses can echo external_uac_settings, including passwords.
    // Keep only status + numeric provider codes, never a provider body/message.
    if (path.startsWith("/uac_connections")) {
      const codes = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors
            .map((item: { code?: unknown }) => String(item.code ?? ""))
            .filter((code: string) => /^\d{1,10}$/.test(code))
            .join(",")
        : "";
      this.logger.warn(
        `${method} /uac_connections failed status=${status ?? "unavailable"} codes=${codes}`,
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

  private uacOptions(path: string) {
    return path.startsWith("/uac_connections")
      ? { timeout: 15_000, maxRedirects: 0 }
      : {};
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    try {
      const { data } = await this.client.post<T>(
        apiUrl(path),
        body,
        this.uacOptions(path),
      );
      return data;
    } catch (error) {
      this.handleError(error, "POST", path);
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
      this.handleError(error, "PUT", path);
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
      this.handleError(error, "PATCH", path);
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
    try {
      const response = await this.client.post(apiUrl(path), body, {
        responseType: "arraybuffer",
        headers: { Accept: "*/*" },
      });
      return {
        data: Buffer.from(response.data as ArrayBuffer),
        contentType:
          (response.headers?.["content-type"] as string | undefined) ??
          "application/octet-stream",
      };
    } catch (error) {
      this.handleError(error, "POST", path);
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
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append(
      options.fieldName ?? "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename,
    );

    let res: Response;
    try {
      res = await fetch(apiUrl(path), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiConfiguration.TELNYX_API_KEY}`,
        },
        body: form,
        ...(options.timeoutMs
          ? { signal: AbortSignal.timeout(options.timeoutMs) }
          : {}),
      });
    } catch (error) {
      this.handleError(error, "POST", path);
    }

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      throw new HttpException(json, res.status || HttpStatus.BAD_GATEWAY);
    }

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
