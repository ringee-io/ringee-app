import { HttpException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import axios from "axios";
import {
  DeepgramLiveCallbacks,
  DeepgramLiveOptions,
  DeepgramLiveSession,
  DeepgramTranscribeOptions,
  PrerecordedResult,
  TranscriptSegment,
} from "./deepgram.types";

const DEEPGRAM_REST_URL = "https://api.deepgram.com/v1/listen";
const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";
const KEEPALIVE_INTERVAL_MS = 8_000;

/**
 * Thin wrapper over Deepgram's stable public API.
 *
 * - Pre-recorded transcription goes through the REST endpoint (used for the
 *   "Transcribe recordings" path over a stored recordingUrl).
 * - Live transcription opens a WebSocket the call audio is streamed into (used
 *   for the realtime path bridged from Telnyx Media Streaming).
 *
 * Credentials never leave the backend: the API key authenticates the REST call
 * and is passed to the live socket via the `token` subprotocol.
 */
@Injectable()
export class DeepgramService {
  private readonly logger = new Logger(DeepgramService.name);

  get isConfigured(): boolean {
    return !!apiConfiguration.DEEPGRAM_API_KEY;
  }

  private requireApiKey(): string {
    const key = apiConfiguration.DEEPGRAM_API_KEY;
    if (!key) {
      throw new HttpException(
        "Transcription is not configured (DEEPGRAM_API_KEY missing)",
        503,
      );
    }
    return key;
  }

  // ── Pre-recorded ────────────────────────────────────────────────────────

  /**
   * Transcribe an already-recorded audio file by URL. The URL must be reachable
   * by Deepgram; for private recordings pass a short-lived signed URL.
   */
  async transcribeUrl(
    url: string,
    options: DeepgramTranscribeOptions = {},
  ): Promise<PrerecordedResult> {
    const apiKey = this.requireApiKey();

    const params = new URLSearchParams({
      model: options.model || apiConfiguration.DEEPGRAM_MODEL,
      language: options.language || apiConfiguration.DEEPGRAM_LANGUAGE,
      smart_format: String(options.smartFormat ?? true),
      punctuate: String(options.punctuate ?? true),
      diarize: String(options.diarize ?? true),
      utterances: "true",
    });

    try {
      const { data } = await axios.post(
        `${DEEPGRAM_REST_URL}?${params.toString()}`,
        { url },
        {
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "application/json",
          },
          // Pre-recorded jobs can take a while for long recordings.
          timeout: 5 * 60 * 1000,
        },
      );

      return this.normalizePrerecorded(data);
    } catch (error: any) {
      const detail =
        error?.response?.data?.err_msg ||
        error?.response?.data?.reason ||
        error?.message ||
        "Deepgram transcription failed";
      this.logger.error(`Deepgram prerecorded error: ${detail}`);
      throw new HttpException(detail, error?.response?.status || 502);
    }
  }

  private normalizePrerecorded(data: any): PrerecordedResult {
    const channel = data?.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    const utterances = data?.results?.utterances as any[] | undefined;
    const durationMs = data?.metadata?.duration
      ? Math.round(Number(data.metadata.duration) * 1000)
      : null;
    const language =
      channel?.detected_language ||
      data?.results?.channels?.[0]?.detected_language ||
      null;

    let segments: TranscriptSegment[] = [];
    if (Array.isArray(utterances) && utterances.length > 0) {
      segments = utterances.map((u) => ({
        text: String(u.transcript ?? "").trim(),
        speaker: typeof u.speaker === "number" ? u.speaker : null,
        track: typeof u.channel === "number" ? `channel_${u.channel}` : null,
        confidence: typeof u.confidence === "number" ? u.confidence : null,
        startMs: typeof u.start === "number" ? Math.round(u.start * 1000) : null,
        endMs: typeof u.end === "number" ? Math.round(u.end * 1000) : null,
      }));
    } else if (alt?.transcript) {
      segments = [
        {
          text: String(alt.transcript).trim(),
          confidence: typeof alt.confidence === "number" ? alt.confidence : null,
        },
      ];
    }

    const text =
      alt?.transcript?.trim() ||
      segments
        .map((s) => s.text)
        .filter(Boolean)
        .join(" ");

    return {
      text,
      confidence: typeof alt?.confidence === "number" ? alt.confidence : null,
      language,
      durationMs,
      segments: segments.filter((s) => s.text.length > 0),
      raw: data,
    };
  }

  // ── Live (streaming) ──────────────────────────────────────────────────────

  /**
   * Open a Deepgram live transcription socket. Audio pushed via
   * {@link DeepgramLiveSession.sendAudio} is transcribed and surfaced through
   * the provided callbacks. The session keeps itself alive with periodic
   * KeepAlive frames so silent stretches don't drop the connection.
   */
  openLive(
    options: DeepgramLiveOptions,
    callbacks: DeepgramLiveCallbacks,
  ): DeepgramLiveSession {
    const apiKey = this.requireApiKey();
    const track = options.track || "mixed";

    const params = new URLSearchParams({
      model: options.model || apiConfiguration.DEEPGRAM_MODEL,
      language: options.language || apiConfiguration.DEEPGRAM_LANGUAGE,
      encoding: options.encoding || "mulaw",
      sample_rate: String(options.sampleRate ?? 8000),
      punctuate: "true",
      smart_format: "true",
      interim_results: "true",
      endpointing: "300",
    });

    // The standard WebSocket API has no header option; Deepgram accepts the
    // API key as the second `token` subprotocol entry instead.
    const socket = new WebSocket(`${DEEPGRAM_WS_URL}?${params.toString()}`, [
      "token",
      apiKey,
    ]);
    socket.binaryType = "arraybuffer";

    let keepAlive: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    socket.addEventListener("open", () => {
      this.logger.debug(`Deepgram live socket open (track=${track})`);
      keepAlive = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_INTERVAL_MS);
      callbacks.onOpen?.();
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      try {
        const payload =
          typeof event.data === "string"
            ? event.data
            : Buffer.from(event.data as ArrayBuffer).toString("utf-8");
        const msg = JSON.parse(payload);
        if (msg.type !== "Results") return;

        const alt = msg.channel?.alternatives?.[0];
        const text: string = (alt?.transcript ?? "").trim();
        if (!text) return;

        if (msg.is_final) {
          const startMs =
            typeof msg.start === "number" ? Math.round(msg.start * 1000) : null;
          const endMs =
            typeof msg.start === "number" && typeof msg.duration === "number"
              ? Math.round((msg.start + msg.duration) * 1000)
              : null;
          callbacks.onFinal?.({
            text,
            track,
            speaker: options.speaker ?? null,
            confidence:
              typeof alt?.confidence === "number" ? alt.confidence : null,
            startMs,
            endMs,
          });
        } else {
          callbacks.onPartial?.(text);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to parse Deepgram message: ${(err as Error).message}`,
        );
      }
    });

    socket.addEventListener("error", (event: Event) => {
      const message =
        (event as ErrorEvent)?.message || "Deepgram live socket error";
      this.logger.error(`Deepgram live error (track=${track}): ${message}`);
      callbacks.onError?.(new Error(message));
    });

    socket.addEventListener("close", () => {
      if (keepAlive) clearInterval(keepAlive);
      callbacks.onClose?.();
    });

    return {
      track,
      sendAudio: (chunk: Buffer) => {
        if (!closed && socket.readyState === WebSocket.OPEN) {
          socket.send(chunk);
        }
      },
      finish: () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "CloseStream" }));
          }
        } catch {
          /* ignore */
        }
        // Give Deepgram a moment to flush the final result before closing.
        setTimeout(() => {
          try {
            socket.close();
          } catch {
            /* ignore */
          }
        }, 1500);
      },
      close: () => {
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      },
    };
  }
}
