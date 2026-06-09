import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { IncomingMessage, Server } from "http";
import { RawData, WebSocket, WebSocketServer } from "ws";

/** Path Telnyx Media Streaming connects to, on the same host/port as the API. */
export const MEDIA_STREAM_PATH = "/media-stream";
import {
  CallTranscriptionRepository,
  TranscriptionSource,
  TranscriptionStatus,
} from "@ringee/database";
import {
  DeepgramLiveSession,
  DeepgramService,
  RedisService,
} from "@ringee/platform";
import {
  LIVE_PARTIAL_TTL_MS,
  LivePartial,
  livePartialKey,
  trackToSpeaker,
} from "./transcription.constants";

/** Per-Telnyx-connection bridge state. */
interface BridgeState {
  callId: string;
  transcriptionId: string | null;
  sessions: Map<string, DeepgramLiveSession>;
  encoding: string;
  sampleRate: number;
  hasFinal: boolean;
  flippedTranscribing: boolean;
}

/**
 * Raw WebSocket server that Telnyx Media Streaming dials. It receives base64
 * audio frames per track, bridges each track into its own Deepgram live socket,
 * persists final segments, and publishes the current partial to Redis so the
 * frontend Live Transcript panel can poll it.
 *
 * It piggybacks on the API's HTTP server (via the `upgrade` event) at
 * {@link MEDIA_STREAM_PATH}, so a single public host/port serves both webhooks
 * and media streaming — no extra port or tunnel. It is intentionally not
 * exposed to the dashboard: only Telnyx connects, and only to a callId that
 * already has a "starting" realtime header.
 */
@Injectable()
export class TranscriptionMediaGateway
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TranscriptionMediaGateway.name);
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly deepgramService: DeepgramService,
    private readonly transcriptionRepo: CallTranscriptionRepository,
    private readonly redisService: RedisService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    if (!this.deepgramService.isConfigured) {
      this.logger.warn(
        "Deepgram not configured (DEEPGRAM_API_KEY missing) — media stream gateway disabled",
      );
      return;
    }
    // noServer: we don't bind our own port; we handle upgrades on the app's
    // HTTP server (wired in onApplicationBootstrap).
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (socket, req) => this.handleConnection(socket, req));
    this.wss.on("error", (err) =>
      this.logger.error(`Media stream server error: ${err.message}`),
    );
    this.logger.log("Media stream gateway initialized (noServer mode)");
  }

  /**
   * Once the app is fully bootstrapped the HTTP server exists, so attach the
   * media-stream upgrade handler to it. Self-contained — no main.ts wiring.
   */
  onApplicationBootstrap(): void {
    if (!this.wss) return; // Deepgram not configured
    const server: Server | undefined =
      this.httpAdapterHost?.httpAdapter?.getHttpServer();
    if (!server) {
      this.logger.error(
        "Could not resolve HTTP server — media stream gateway not attached",
      );
      return;
    }
    this.attachToServer(server);
  }

  /**
   * Wire the media-stream WebSocket onto the API's HTTP server. Telnyx connects
   * to wss://<api-host>{MEDIA_STREAM_PATH}.
   */
  attachToServer(server: Server): void {
    if (!this.wss) return; // Deepgram not configured
    server.on("upgrade", (req, socket, head) => {
      let pathname = "/";
      try {
        pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      } catch {
        /* keep default */
      }
      // Only claim our path; leave every other upgrade for other handlers.
      if (pathname !== MEDIA_STREAM_PATH) return;
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit("connection", ws, req);
      });
    });
    this.logger.log(
      `📡 Telnyx media stream attached on the API server at ${MEDIA_STREAM_PATH}`,
    );
  }

  onModuleDestroy(): void {
    this.wss?.close();
  }

  private async handleConnection(
    socket: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const callId = url.searchParams.get("callId");

    if (!callId) {
      this.logger.warn("Media stream connection without callId — rejecting");
      socket.close();
      return;
    }

    // Only accept streams for a call that actually asked for realtime
    // transcription (guards against arbitrary injection into the pipeline).
    const header = await this.transcriptionRepo.findHeaderByCallAndSource(
      callId,
      TranscriptionSource.realtime,
    );
    const acceptable: TranscriptionStatus[] = [
      TranscriptionStatus.starting,
      TranscriptionStatus.transcribing,
    ];
    if (!header || !acceptable.includes(header.status)) {
      this.logger.warn(
        `Media stream for call ${callId} has no active realtime header — rejecting`,
      );
      socket.close();
      return;
    }

    const state: BridgeState = {
      callId,
      transcriptionId: header.id,
      sessions: new Map(),
      encoding: "mulaw",
      sampleRate: 8000,
      hasFinal: false,
      flippedTranscribing: false,
    };

    this.logger.log(`🎙️ Media stream connected for call ${callId}`);

    socket.on("message", (data: RawData) => this.handleMessage(state, data));
    socket.on("close", () => this.finalize(state));
    socket.on("error", (err) => {
      this.logger.warn(`Media socket error (call ${callId}): ${err.message}`);
    });
  }

  private handleMessage(state: BridgeState, data: RawData): void {
    let msg: any;
    try {
      msg = JSON.parse(data.toString("utf-8"));
    } catch {
      return; // non-JSON frame, ignore
    }

    switch (msg.event) {
      case "start": {
        const fmt = msg.start?.media_format;
        if (fmt?.encoding) {
          // Telnyx reports "PCMU" → Deepgram "mulaw"; "PCMA" → "alaw".
          const enc = String(fmt.encoding).toUpperCase();
          state.encoding =
            enc === "PCMU" ? "mulaw" : enc === "PCMA" ? "alaw" : "mulaw";
        }
        if (fmt?.sample_rate) state.sampleRate = Number(fmt.sample_rate);
        break;
      }
      case "media": {
        const payload: string | undefined = msg.media?.payload;
        if (!payload) return;
        const track: string = msg.media?.track || "inbound";
        const session = this.getOrCreateSession(state, track);
        session.sendAudio(Buffer.from(payload, "base64"));
        break;
      }
      case "stop": {
        this.finalize(state);
        break;
      }
      default:
        break;
    }
  }

  private getOrCreateSession(state: BridgeState, track: string): DeepgramLiveSession {
    const existing = state.sessions.get(track);
    if (existing) return existing;

    const session = this.deepgramService.openLive(
      {
        encoding: state.encoding,
        sampleRate: state.sampleRate,
        track,
        speaker: trackToSpeaker(track) ?? undefined,
      },
      {
        onOpen: () => {
          if (!state.flippedTranscribing && state.transcriptionId) {
            state.flippedTranscribing = true;
            void this.transcriptionRepo
              .markStatus(state.transcriptionId, TranscriptionStatus.transcribing)
              .catch(() => undefined);
          }
        },
        onPartial: (text) => {
          const partial: LivePartial = { track, text, at: Date.now() };
          void this.redisService
            .set(livePartialKey(state.callId), partial, LIVE_PARTIAL_TTL_MS)
            .catch(() => undefined);
        },
        onFinal: (segment) => {
          state.hasFinal = true;
          // Clear the partial as soon as a final segment lands.
          void this.redisService
            .del(livePartialKey(state.callId))
            .catch(() => undefined);
          if (!state.transcriptionId) return;
          void this.transcriptionRepo
            .appendFinalSegment(state.transcriptionId, {
              callId: state.callId,
              text: segment.text,
              speaker: segment.speaker ?? trackToSpeaker(track),
              track,
              confidence: segment.confidence,
              startMs: segment.startMs,
              endMs: segment.endMs,
            })
            .catch((err) =>
              this.logger.warn(
                `Failed to persist segment (call ${state.callId}): ${err.message}`,
              ),
            );
        },
        onError: (err) => {
          this.logger.warn(
            `Deepgram error (call ${state.callId}, track ${track}): ${err.message}`,
          );
        },
      },
    );

    state.sessions.set(track, session);
    return session;
  }

  private finalize(state: BridgeState): void {
    if (state.sessions.size === 0 && !state.transcriptionId) return;

    for (const session of state.sessions.values()) {
      session.finish();
    }
    state.sessions.clear();

    void this.redisService.del(livePartialKey(state.callId)).catch(() => undefined);

    if (!state.transcriptionId) return;
    const finalStatus = state.hasFinal
      ? TranscriptionStatus.completed
      : TranscriptionStatus.stopped;

    // Give Deepgram a beat to flush the last final before we stamp completion.
    setTimeout(() => {
      void this.transcriptionRepo
        .markStatus(state.transcriptionId!, finalStatus, {
          completedAt: new Date(),
        })
        .catch(() => undefined);
      this.logger.log(
        `🏁 Media stream finalized for call ${state.callId} (${finalStatus})`,
      );
    }, 2000);
  }
}
