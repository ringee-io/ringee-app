import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  VoicemailDropAssetRepository,
  CallRepository,
  NumberPurchasedRepository,
  CallStatus,
  VoicemailDropAsset,
} from "@ringee/database";
import { TelephonyService, UploadFactory } from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { OwnershipContext } from "@ringee/platform";
import { InboxTimelineService } from "../inbox/inbox.timeline.service";
import { ComplianceService } from "./compliance.service";
import { CreditService } from "../credit.service";
import { UserService } from "../user.service";
import { ContactService } from "../contact.service";
import { CallerIdRotationService } from "../caller-id-rotation/caller-id-rotation.service";

const E164 = /^\+[1-9]\d{6,14}$/;

/** Placeholder used when an agent records a one-off drop without naming it. */
export const UNNAMED_VOICEMAIL_LABEL = "N/A";

/** Ring long enough to divert to voicemail, but never camp on the line. */
const VOICEMAIL_RING_TIMEOUT_SECS = 45;
/**
 * Absolute ceiling for a drop leg. Only a safety net against a mailbox whose
 * greeting never signals its end — the normal terminator is `playback.ended`.
 * Must exceed greeting + the longest recordable message (180s) or a full
 * length drop gets cut off mid-sentence.
 */
const VOICEMAIL_MAX_CALL_SECS = 300;

/**
 * Telnyx's `playback_start` decodes ONLY these two. Accepting anything else
 * produces a drop that runs for the file's full duration while the callee
 * hears silence, so the upload is rejected instead — a loud failure at record
 * time beats a silent one at send time.
 */
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3", "wav"]);

/** Decoded `client_state` we stamp on every drop leg we originate. */
export interface VoicemailDropClientState extends Record<string, unknown> {
  action: "voicemail_drop_send";
  assetId: string;
  callId?: string;
}

export interface SendVoicemailInput {
  assetId: string;
  /** Destination in E.164. */
  toNumber: string;
  /** Caller ID to present. Resolved from the workspace when omitted. */
  fromNumber?: string;
  contactId?: string | null;
  /** The call this drop follows up on, when sent from a post-call flow. */
  callId?: string | null;
  /** Origin channel, stamped on the Call row for history filtering. */
  source?: string;
}

export interface SendVoicemailResult {
  callId: string;
  callControlId: string;
  assetId: string;
  assetName: string;
}

@Injectable()
export class VoicemailDropService {
  private readonly logger = new Logger(VoicemailDropService.name);

  constructor(
    private readonly assetRepo: VoicemailDropAssetRepository,
    private readonly telephonyService: TelephonyService,
    private readonly callRepo: CallRepository,
    private readonly inboxTimelineService: InboxTimelineService,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly complianceService: ComplianceService,
    private readonly creditService: CreditService,
    private readonly userService: UserService,
    private readonly contactService: ContactService,
    private readonly callerIdRotationService: CallerIdRotationService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Asset bucket
  // ────────────────────────────────────────────────────────────

  async createAsset(
    ctx: OwnershipContext,
    data: {
      name?: string | null;
      description?: string | null;
      fileUrl: string;
      durationSec?: number;
      isDefault?: boolean;
    },
  ): Promise<VoicemailDropAsset> {
    const organizationId = this.requireOrg(ctx);
    if (!data.fileUrl) {
      throw new BadRequestException("fileUrl is required");
    }

    // A drop recorded inline during wrap-up has nothing to name it after, so
    // an unnamed asset gets the placeholder in BOTH fields rather than
    // blocking the send behind a form the agent never asked for. A named one
    // keeps a genuinely empty description empty.
    const trimmedName = data.name?.trim();
    const trimmedDescription = data.description?.trim();
    const name = trimmedName || UNNAMED_VOICEMAIL_LABEL;
    const description =
      trimmedDescription || (trimmedName ? null : UNNAMED_VOICEMAIL_LABEL);

    if (data.isDefault) {
      await this.assetRepo.clearDefault(organizationId);
    }

    return this.assetRepo.create({
      organizationId,
      userId: ctx.userId,
      name,
      description,
      fileUrl: data.fileUrl,
      durationSec: data.durationSec,
      isDefault: data.isDefault,
    });
  }

  async listAssets(organizationId: string): Promise<VoicemailDropAsset[]> {
    return this.assetRepo.findByOrganization(organizationId);
  }

  async updateAsset(
    ctx: OwnershipContext,
    id: string,
    data: { name?: string; description?: string | null; isDefault?: boolean },
  ): Promise<VoicemailDropAsset> {
    const organizationId = this.requireOrg(ctx);
    await this.requireAsset(id, organizationId);

    if (data.isDefault) {
      await this.assetRepo.clearDefault(organizationId);
    }

    return this.assetRepo.update(id, {
      ...(data.name !== undefined
        ? { name: data.name.trim() || UNNAMED_VOICEMAIL_LABEL }
        : {}),
      ...(data.description !== undefined
        ? { description: data.description?.trim() || null }
        : {}),
      ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
    });
  }

  async deleteAsset(
    ctx: OwnershipContext,
    id: string,
  ): Promise<VoicemailDropAsset> {
    const organizationId = this.requireOrg(ctx);
    await this.requireAsset(id, organizationId);
    return this.assetRepo.delete(id);
  }

  /**
   * Store a recorded/uploaded greeting and hand back its public URL. Telnyx
   * fetches the audio by URL when the drop plays, so it must be reachable AND
   * in a format the provider decodes.
   */
  async uploadAudio(input: {
    buffer: Buffer;
    contentType: string;
    filename?: string;
  }): Promise<{ url: string }> {
    const extFromName = input.filename?.includes(".")
      ? input.filename.split(".").pop()
      : undefined;
    const extFromType = input.contentType.includes("/")
      ? input.contentType.split("/")[1]?.split(";")[0]?.split("+")[0]
      : undefined;
    const ext = (extFromName || extFromType || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      // audio/x-wav, audio/wave and audio/vnd.wave all mean the same file.
      .replace(/^(xwav|wave|vndwave)$/, "wav")
      .replace(/^(mpeg|xmpeg|mpeg3|xmp3)$/, "mp3");

    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `Voicemail audio must be MP3 or WAV (received ${
          input.contentType || "unknown"
        }). Other formats play back as silence.`,
      );
    }

    const storage = UploadFactory.createStorage();
    const key = `voicemail-drops/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}.${ext}`;
    const url = await storage.uploadBuffer(
      key,
      input.buffer,
      ext === "wav" ? "audio/wav" : "audio/mpeg",
      ext,
    );
    return { url };
  }

  // ────────────────────────────────────────────────────────────
  // Sending
  // ────────────────────────────────────────────────────────────

  /**
   * Send a voicemail as its own outbound call — the post-call path, where the
   * conversation already hung up. Telnyx dials with answering-machine
   * detection on and the webhook handlers below play the asset into the
   * greeting, then hang up.
   */
  async sendVoicemail(
    ctx: OwnershipContext,
    input: SendVoicemailInput,
  ): Promise<SendVoicemailResult> {
    const organizationId = this.requireOrg(ctx);
    const asset = await this.requireAsset(input.assetId, organizationId);

    const destination = this.normalizeE164(input.toNumber);
    if (!destination) {
      throw new BadRequestException(`Invalid destination ${input.toNumber}`);
    }

    const user = await this.userService.getCachedUserById(ctx.userId);
    if (user?.canCall === false) {
      throw new ForbiddenException("Outbound calling is disabled");
    }

    const onDnc = await this.complianceService
      .findOnDNC(ctx, destination)
      .catch(() => null);
    if (onDnc) {
      throw new ForbiddenException(
        onDnc.reason
          ? `Destination is on the DNC list: ${onDnc.reason}`
          : "Destination is on the DNC list",
      );
    }

    // A drop is a real billed call, so it takes the same balance gate as a
    // dialed one. The exact cost is still settled on `call.cost`.
    if (!user?.freeCallTrial) {
      const balance = await this.creditService.getBalance(ctx).catch(() => 0);
      if (balance <= 0) {
        throw new ForbiddenException("Insufficient credits");
      }
    }

    const callerId = await this.resolveCallerId(
      ctx,
      organizationId,
      destination,
      input.fromNumber,
    );
    if (!callerId) {
      throw new BadRequestException(
        "No caller ID available to send the voicemail from",
      );
    }

    const clientState: VoicemailDropClientState = {
      action: "voicemail_drop_send",
      assetId: asset.id,
      ...(input.callId ? { callId: input.callId } : {}),
    };

    const leg = await this.telephonyService.dial({
      to: destination,
      from: callerId,
      clientState,
      // `greeting_end` is what makes this a voicemail drop rather than a cold
      // call: Telnyx waits out the machine's greeting and tells us when to
      // start playing.
      answeringMachineDetection: "greeting_end",
      timeoutSecs: VOICEMAIL_RING_TIMEOUT_SECS,
      timeLimitSecs: VOICEMAIL_MAX_CALL_SECS,
    });

    if (!leg.callControlId) {
      throw new BadRequestException("Provider did not return a call");
    }

    const contact = await this.resolveContact(
      ctx,
      organizationId,
      destination,
      input.contactId,
    );

    const presentedNumberId = await this.callerIdRotationService
      .registerOutboundCall(ctx, callerId)
      .catch(() => null);

    // Created here rather than on `call.initiated`: the webhook for a
    // server-originated leg carries none of the custom headers the WebRTC
    // path relies on to attribute the call, so it would be dropped.
    const call = await this.callRepo.createCall(ctx, {
      contact: contact ? { connect: { id: contact.id } } : undefined,
      fromNumber: callerId,
      toNumber: destination,
      connectionId: apiConfiguration.TELNYX_CONNECTION_ID,
      callControlId: leg.callControlId,
      callSessionId: leg.callSessionId ?? undefined,
      callLegId: leg.callLegId ?? undefined,
      direction: "outbound",
      status: CallStatus.ringing,
      startedAt: new Date(),
      source: input.source ?? "voicemail_drop",
      clientState: Buffer.from(JSON.stringify(clientState)).toString("base64"),
      callerId: presentedNumberId
        ? { connect: { id: presentedNumberId } }
        : undefined,
    });

    void this.appendTimelineEvent({
      ctx,
      callId: call.id,
      asset,
      ringeeNumber: callerId,
      participantNumber: destination,
      contactId: contact?.id ?? null,
    });

    this.logger.log(
      `📼 Voicemail drop ${asset.id} dialing ${destination} (call ${call.id})`,
    );

    return {
      callId: call.id,
      callControlId: leg.callControlId,
      assetId: asset.id,
      assetName: asset.name,
    };
  }

  /**
   * Drop a voicemail on an active call. Initiates audio playback via the
   * provider; the call is hung up after playback completes.
   */
  async dropVoicemail(callControlId: string, assetId: string): Promise<void> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset || asset.deletedAt) {
      throw new NotFoundException("Voicemail asset not found");
    }

    await this.telephonyService.playbackStart(callControlId, asset.fileUrl, {
      action: "voicemail_drop",
      assetId: asset.id,
    });
    this.logger.log(
      `Voicemail drop initiated on call ${callControlId} with asset ${assetId}`,
    );

    // Inbox timeline event (best-effort).
    try {
      const call = await this.callRepo.findByControlId(callControlId);
      if (call?.userId) {
        const ringeeNumber =
          call.direction === "outbound" ? call.fromNumber : call.toNumber;
        const participantNumber =
          call.direction === "outbound" ? call.toNumber : call.fromNumber;
        await this.appendTimelineEvent({
          ctx: { userId: call.userId, organizationId: call.organizationId },
          callId: call.id,
          asset,
          ringeeNumber,
          participantNumber,
          contactId: call.contactId ?? null,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Inbox appendVoiceDropEvent failed: ${(err as Error).message}`,
      );
    }
  }

  // ────────────────────────────────────────────────────────────
  // Webhook handlers (driven by CallService)
  // ────────────────────────────────────────────────────────────

  /**
   * Decode the `client_state` Telnyx echoes back on every event of a leg we
   * originated. Returns null for any leg that is not one of our drops.
   */
  parseClientState(
    clientState?: string | null,
  ): VoicemailDropClientState | null {
    if (!clientState) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(clientState, "base64").toString("utf-8"),
      );
      return decoded?.action === "voicemail_drop_send" &&
        typeof decoded.assetId === "string"
        ? (decoded as VoicemailDropClientState)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Playback commands carry their own `client_state`, so playback events on a
   * drop are recognised by that marker rather than the dial's. Covers both the
   * post-call send and the drop performed on a still-live call.
   */
  isPlaybackState(clientState?: string | null): boolean {
    if (!clientState) return false;
    try {
      const decoded = JSON.parse(
        Buffer.from(clientState, "base64").toString("utf-8"),
      );
      return (
        decoded?.action === "voicemail_drop_playback" ||
        decoded?.action === "voicemail_drop"
      );
    } catch {
      return false;
    }
  }

  /**
   * The machine finished its greeting → play the asset. Telnyx emits this
   * only when `answering_machine_detection: greeting_end` was requested.
   */
  async handleGreetingEnded(
    callControlId: string,
    state: VoicemailDropClientState,
  ): Promise<void> {
    const asset = await this.assetRepo.findById(state.assetId);
    if (!asset) {
      this.logger.warn(
        `Voicemail asset ${state.assetId} vanished before playback on ${callControlId}; hanging up`,
      );
      await this.hangupQuietly(callControlId);
      return;
    }

    await this.telephonyService
      .playbackStart(callControlId, asset.fileUrl, {
        action: "voicemail_drop_playback",
        assetId: asset.id,
      })
      .catch(async (err) => {
        this.logger.error(
          `Playback failed on voicemail drop ${callControlId}: ${err.message}`,
        );
        await this.hangupQuietly(callControlId);
      });
  }

  /**
   * End the leg without playing anything. Used whenever the destination is
   * not a confirmed answering machine — a live person picked up, or detection
   * was inconclusive. A drop is only ever meant to be heard from the mailbox,
   * so the message is withheld rather than played at whoever answered.
   */
  async abortDrop(callControlId: string): Promise<void> {
    await this.hangupQuietly(callControlId);
  }

  /** Message delivered — release the leg. */
  async handlePlaybackEnded(callControlId: string): Promise<void> {
    await this.hangupQuietly(callControlId);
  }

  // ────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────

  private requireOrg(ctx: OwnershipContext): string {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Organization required");
    }
    return ctx.organizationId;
  }

  private async requireAsset(
    id: string,
    organizationId: string,
  ): Promise<VoicemailDropAsset> {
    const asset = await this.assetRepo.findByIdForOrganization(
      id,
      organizationId,
    );
    if (!asset) {
      throw new NotFoundException("Voicemail asset not found");
    }
    return asset;
  }

  private normalizeE164(value: string): string | null {
    const trimmed = (value ?? "").trim().replace(/[\s()-]/g, "");
    return E164.test(trimmed) ? trimmed : null;
  }

  /**
   * Pick the number the drop presents as. An explicit `fromNumber` is honored
   * only when the workspace owns it; otherwise we fall back to rotation (or
   * any owned number) exactly like a dialed call.
   */
  private async resolveCallerId(
    ctx: OwnershipContext,
    organizationId: string,
    destination: string,
    requested?: string,
  ): Promise<string | null> {
    if (requested) {
      const owned = await this.numberRepo
        .findOwnedByPhone(ctx, requested)
        .catch(() => null);
      if (!owned) {
        throw new ForbiddenException(
          `Caller ID ${requested} is not owned by this workspace`,
        );
      }
      return owned.phoneNumber;
    }

    const fallback = await this.numberRepo.findOne({
      organizationId,
      kind: "purchased",
      status: { in: ["active", "assigned"] },
      deletedAt: null,
    });

    const selected = await this.callerIdRotationService
      .selectForDial(ctx, destination, {
        phoneNumber: fallback?.phoneNumber ?? null,
        numberId: fallback?.id ?? null,
      })
      .catch(() => null);

    return selected?.phoneNumber ?? fallback?.phoneNumber ?? null;
  }

  /**
   * A caller-supplied `contactId` is trusted only after it checks out against
   * the workspace; otherwise we fall back to matching on the destination.
   */
  private async resolveContact(
    ctx: OwnershipContext,
    organizationId: string,
    destination: string,
    contactId?: string | null,
  ): Promise<{ id: string } | null> {
    if (contactId) {
      const contact = await this.contactService
        .getContactById(contactId)
        .catch(() => null);
      if (contact && contact.organizationId === organizationId) {
        return contact;
      }
    }
    return this.contactService.findByPhone(ctx, destination).catch(() => null);
  }

  private async appendTimelineEvent(params: {
    ctx: OwnershipContext;
    callId: string;
    asset: VoicemailDropAsset;
    ringeeNumber: string;
    participantNumber: string;
    contactId: string | null;
  }): Promise<void> {
    await this.inboxTimelineService
      .appendVoiceDropEvent({
        ctx: params.ctx,
        callId: params.callId,
        voicemailDropAssetId: params.asset.id,
        ringeeNumber: params.ringeeNumber,
        participantNumber: params.participantNumber,
        contactId: params.contactId,
        assetName: params.asset.name,
        audioUrl: params.asset.fileUrl,
        durationSec: params.asset.durationSec ?? null,
      })
      .catch((err) =>
        this.logger.warn(
          `Inbox appendVoiceDropEvent failed: ${(err as Error).message}`,
        ),
      );
  }

  private async hangupQuietly(callControlId: string): Promise<void> {
    await this.telephonyService
      .hangupCall(callControlId)
      .catch((err) =>
        this.logger.warn(
          `Failed to hang up voicemail drop ${callControlId}: ${err.message}`,
        ),
      );
  }
}
