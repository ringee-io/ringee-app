import { Injectable } from "@nestjs/common";
import {
  CallRepository,
  RecordingRepository,
  Recording,
} from "@ringee/database";
import {
  CreateRecordingDto,
  CryptoService,
  OwnershipContext,
  UpdateRecordingDto,
} from "@ringee/platform";
import { EncryptionKeyService } from "./encryption-key.service";

/** How long reading a stored recording back may take before playback fails. */
const RECORDING_READ_TIMEOUT_MS = 30_000;

/** The recording a player opens: the first finished one, as the dashboard picks it. */
function playableRecording(recordings: Recording[]): Recording | null {
  const oldestFirst = [...recordings].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return (
    oldestFirst.find((r) => r.status === "completed" && r.url) ??
    oldestFirst.find((r) => r.url) ??
    null
  );
}

@Injectable()
export class RecordingService {
  constructor(
    private readonly repository: RecordingRepository,
    private readonly callRepository: CallRepository,
    private readonly encryptionKeys: EncryptionKeyService,
    private readonly cryptoService: CryptoService,
  ) {}

  async createRecording(dto: CreateRecordingDto): Promise<Recording> {
    return this.repository.create({
      call: { connect: { id: dto.callId } },
      url: dto.url,
      format: dto.format,
      status: dto.status,
    });
  }

  async updateRecording(
    id: string,
    dto: UpdateRecordingDto,
  ): Promise<Recording> {
    return this.repository.update(id, {
      url: dto.url,
      format: dto.format,
      status: dto.status,
    });
  }

  async getRecording(id: string): Promise<Recording | null> {
    return this.repository.findById(id);
  }

  /** A recording of `callId`; another call's recording reads as missing. */
  async getRecordingForCall(
    callId: string,
    id: string,
  ): Promise<Recording | null> {
    return this.repository.findForCall(callId, id);
  }

  async findRecordingsByCallId(callId: string): Promise<Recording[]> {
    return this.repository.findByCallId(callId);
  }

  /**
   * A call's recording as mp3 audio, for a client that plays it but cannot
   * decrypt it: the browser extension, whose CSP reaches Ringee's API and not
   * the storage bucket. `Recording.url` is the encrypted copy (REC-001), so it
   * is decrypted here with the workspace key (REC-002) and the key never
   * leaves the server.
   *
   * `null` when the call is not the caller's to open — another workspace's, or
   * a teammate's for a member — or has no finished recording. Both answer the
   * same, so an id cannot be used to probe for what exists.
   */
  async getPlaybackAudio(
    ctx: OwnershipContext,
    callId: string,
    options: { filterUserId?: string } = {},
  ): Promise<Buffer | null> {
    const call = await this.callRepository.findByIdForOwner(
      ctx,
      callId,
      options,
    );
    if (!call) return null;

    const recording = playableRecording(
      await this.repository.findByCallId(call.id),
    );
    if (!recording?.url) return null;

    // The URL is the one recording processing stored for its own upload,
    // never one a client sent.
    const res = await fetch(recording.url, {
      signal: AbortSignal.timeout(RECORDING_READ_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(
        `Recording ${recording.id} could not be read: HTTP ${res.status}`,
      );
    }
    const key = await this.encryptionKeys.getWorkspaceKey(ctx);
    return this.cryptoService.decryptBuffer(
      Buffer.from(await res.arrayBuffer()),
      key,
    );
  }
}
