import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError, AxiosInstance } from "axios";
import { apiConfiguration } from "@ringee/configuration";
import {
  TriggerLoopEventName,
  TriggerLoopSubject,
  TriggerLoopWorkflowKey,
} from "../types/triggerloop.types";

export interface SendEventInput {
  eventName: TriggerLoopEventName;
  subject: TriggerLoopSubject;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface StartWorkflowInput {
  workflowKey: TriggerLoopWorkflowKey;
  subject: TriggerLoopSubject;
  payload?: Record<string, unknown>;
}

export interface CancelWorkflowInput {
  workflowInstanceId: string;
  reason?: string;
}

const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

export interface ClientSendResult {
  ok: boolean;
  status: number | null;
  error?: string;
  /** True when the failure looks transient — worth enqueueing for retry. */
  retryable: boolean;
}

@Injectable()
export class TriggerLoopClient {
  private readonly logger = new Logger(TriggerLoopClient.name);
  private readonly http: AxiosInstance;
  private readonly projectKey: string;

  constructor() {
    this.projectKey = apiConfiguration.TRIGGERLOOP_PROJECT_KEY;
    this.http = axios.create({
      baseURL: apiConfiguration.TRIGGERLOOP_BASE_URL,
      timeout: 5_000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfiguration.TRIGGERLOOP_API_KEY}`,
        "X-Project-Key": this.projectKey,
      },
    });
  }

  get eventsEndpoint() {
    return "/events";
  }

  get startWorkflowEndpoint() {
    return "/workflows/start";
  }

  get cancelWorkflowEndpoint() {
    return "/workflows/cancel";
  }

  buildEventBody(input: SendEventInput): Record<string, unknown> {
    return {
      projectKey: this.projectKey,
      eventName: input.eventName,
      subject: input.subject,
      payload: input.payload ?? {},
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    };
  }

  buildStartWorkflowBody(input: StartWorkflowInput): Record<string, unknown> {
    return {
      projectKey: this.projectKey,
      workflowKey: input.workflowKey,
      subject: input.subject,
      payload: input.payload ?? {},
    };
  }

  buildCancelWorkflowBody(input: CancelWorkflowInput): Record<string, unknown> {
    return {
      projectKey: this.projectKey,
      workflowInstanceId: input.workflowInstanceId,
      reason: input.reason,
    };
  }

  async sendEvent(input: SendEventInput): Promise<ClientSendResult> {
    return this.request(this.eventsEndpoint, this.buildEventBody(input));
  }

  async startWorkflow(input: StartWorkflowInput): Promise<ClientSendResult> {
    return this.request(
      this.startWorkflowEndpoint,
      this.buildStartWorkflowBody(input),
    );
  }

  async cancelWorkflow(input: CancelWorkflowInput): Promise<ClientSendResult> {
    return this.request(
      this.cancelWorkflowEndpoint,
      this.buildCancelWorkflowBody(input),
    );
  }

  /**
   * Send a pre-built payload straight to an endpoint. Used by the outbox
   * worker to replay previously-persisted requests.
   */
  async sendRaw(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<ClientSendResult> {
    return this.request(endpoint, body);
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ClientSendResult> {
    let attempt = 0;
    let lastErr: AxiosError | null = null;

    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        await this.http.request({ method: "POST", url: path, data: body });
        return { ok: true, status: null, retryable: false };
      } catch (err) {
        const axiosErr = err as AxiosError;
        lastErr = axiosErr;
        const status = axiosErr.response?.status ?? null;
        const retryable = status === null || RETRY_STATUS_CODES.has(status);

        if (!retryable) {
          this.logger.warn(
            `TriggerLoop POST ${path} non-retryable error: status=${status} message=${axiosErr.message}`,
          );
          return {
            ok: false,
            status,
            retryable: false,
            error: axiosErr.message,
          };
        }

        if (attempt >= MAX_ATTEMPTS) break;
        const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    const status = lastErr?.response?.status ?? null;
    this.logger.warn(
      `TriggerLoop POST ${path} failed after ${attempt} attempts: status=${status ?? "network"}`,
    );
    return {
      ok: false,
      status,
      retryable: true,
      error: lastErr?.message ?? "unknown",
    };
  }
}
