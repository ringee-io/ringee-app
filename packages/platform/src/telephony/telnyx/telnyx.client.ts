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
