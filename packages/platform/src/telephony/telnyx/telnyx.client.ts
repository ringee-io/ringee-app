import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class TelnyxClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://api.telnyx.com/v2",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfiguration.TELNYX_API_KEY}`,
      },
    });
  }

  private handleError(error: any): never {
    throw new HttpException(
      error.response?.data || error.message,
      error.response?.status || HttpStatus.BAD_GATEWAY,
    );
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    try {
      const { data } = await this.client.post<T>(path, body);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async get<T = any>(path: string): Promise<T> {
    try {
      const { data } = await this.client.get<T>(path);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async patch<T = any>(path: string, body?: any): Promise<T> {
    try {
      const { data } = await this.client.patch<T>(path, body);
      return data;
    } catch (error) {
      this.handleError(error);
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
      const response = await this.client.post(path, body, {
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
      this.handleError(error);
    }
  }

  async delete<T = any>(path: string): Promise<T> {
    try {
      const { data } = await this.client.delete<T>(path);
      return data;
    } catch (error) {
      this.handleError(error);
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
  ): Promise<T> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append(
      "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename,
    );

    const res = await fetch(`https://api.telnyx.com/v2${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiConfiguration.TELNYX_API_KEY}`,
      },
      body: form,
    });

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
      this.handleError(error);
    }
  }
}
