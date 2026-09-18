import { Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import axios, { AxiosInstance } from "axios";

const TELNYX_BASE_URL = "https://api.telnyx.com/v2";

/**
 * A request path, checked to stay on the Telnyx API. Paths carry ids from
 * webhooks and user records; an absolute or protocol-relative value would
 * make axios drop `baseURL` and send the API key to another host.
 */
function apiPath(path: string): string {
  if (!/^\/(?![/\\])[^\s\\]*$/.test(path) || path.includes("://")) {
    throw new HttpException(
      "Invalid telephony provider path",
      HttpStatus.BAD_REQUEST,
    );
  }
  return path;
}

@Injectable()
export class TelnyxClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: TELNYX_BASE_URL,
      allowAbsoluteUrls: false,
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
        apiPath(path),
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
        apiPath(path),
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
      const { data } = await this.client.get<string>(apiPath(path), {
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
      const { data } = await this.client.put<T>(apiPath(path), body);
      return data;
    } catch (error) {
      this.handleError(error, "PUT", path);
    }
  }

  async patch<T = any>(path: string, body?: any): Promise<T> {
    try {
      const { data } = await this.client.patch<T>(
        apiPath(path),
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
      const response = await this.client.post(apiPath(path), body, {
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
        apiPath(path),
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
      res = await fetch(`${TELNYX_BASE_URL}${apiPath(path)}`, {
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
