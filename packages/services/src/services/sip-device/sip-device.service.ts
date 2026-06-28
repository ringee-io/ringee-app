import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import {
  NumberInboundMode,
  NumberKind,
  NumberPurchased,
  SipDeviceStatus,
  SipDeviceRepository,
  SipDeviceWithNumber,
  NumberPurchasedRepository,
} from "@ringee/database";
import {
  CryptoService,
  OwnershipContext,
  TelnyxService,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import {
  ChangeNumberInput,
  CreateSipDeviceInput,
  CreatedSipDevice,
  DeleteSipDeviceInput,
  SipDeviceCredentials,
  SipDeviceView,
} from "./sip-device.types";

const SIP_SERVER = "sip.telnyx.com";
const SIP_PORT = 5061;
// Crockford-ish: no 0/1/l/o to keep refs unambiguous when read aloud.
const REF_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

@Injectable()
export class SipDeviceService {
  private readonly logger = new Logger(SipDeviceService.name);

  constructor(
    private readonly sipDeviceRepo: SipDeviceRepository,
    private readonly numberRepo: NumberPurchasedRepository,
    private readonly telnyx: TelnyxService,
    private readonly crypto: CryptoService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // Reads
  // ───────────────────────────────────────────────────────────────────────

  async list(ctx: OwnershipContext): Promise<SipDeviceView[]> {
    const devices = await this.sipDeviceRepo.listByOwner(ctx);
    return devices.map((d) => this.toView(d));
  }

  async get(ctx: OwnershipContext, id: string): Promise<SipDeviceView> {
    const device = await this.getOwnedDevice(ctx, id);
    return this.toView(device);
  }

  /**
   * Purchased numbers in the workspace with their current inbound routing —
   * powers the "select a number" step of the create wizard. Verified external
   * caller IDs are excluded (they cannot receive inbound on a SIP connection).
   */
  async listAssignableNumbers(ctx: OwnershipContext): Promise<
    Array<{
      id: string;
      phoneNumber: string;
      inboundMode: NumberInboundMode;
      inboundDeviceLabel: string | null;
    }>
  > {
    const [numbers, devices] = await Promise.all([
      this.numberRepo.findByOwner(ctx),
      this.sipDeviceRepo.listByOwner(ctx),
    ]);
    const labelById = new Map(devices.map((d) => [d.id, d.label]));
    return numbers
      .filter((n) => n.kind === NumberKind.purchased && !n.deletedAt)
      .map((n) => ({
        id: n.id,
        phoneNumber: n.phoneNumber,
        inboundMode: n.inboundMode,
        inboundDeviceLabel: n.inboundSipDeviceId
          ? (labelById.get(n.inboundSipDeviceId) ?? null)
          : null,
      }));
  }

  /**
   * Best-effort registration check. Telnyx does not expose live SIP
   * registration state for credential connections, so this confirms the
   * connection still exists/active and returns the current device view; the
   * webhook-driven `lastRegisteredAt` remains the source of truth.
   */
  async checkRegistration(
    ctx: OwnershipContext,
    id: string,
  ): Promise<SipDeviceView> {
    const device = await this.getOwnedDevice(ctx, id);
    if (device.status === SipDeviceStatus.deleted) {
      return this.toView(device);
    }
    const remote = await this.telnyx
      .getDeskPhoneConnection(device.telnyxConnectionId)
      .catch((err) => {
        this.logger.warn(
          `checkRegistration: Telnyx lookup failed for ${device.publicRef}: ${err.message}`,
        );
        return undefined;
      });

    // The connection vanished in Telnyx — reflect that locally.
    if (remote === null) {
      const updated = await this.sipDeviceRepo.update(device.id, {
        status: SipDeviceStatus.deleted,
        deletedAt: new Date(),
      });
      return this.toView({ ...device, ...updated });
    }
    return this.toView(device);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Create
  // ───────────────────────────────────────────────────────────────────────

  async create(
    ctx: OwnershipContext,
    actingUserId: string,
    input: CreateSipDeviceInput,
  ): Promise<CreatedSipDevice> {
    this.assertFeatureEnabled();
    const ovp = apiConfiguration.TELNYX_OUTBOUND_VOICE_PROFILE_ID;
    if (!ovp) {
      throw new BadRequestException(
        "Desk Phones are not configured: TELNYX_OUTBOUND_VOICE_PROFILE_ID is missing.",
      );
    }

    const label = (input.label ?? "").trim();
    if (!label) {
      throw new BadRequestException("A device name is required.");
    }

    const allowInbound = input.allowInbound ?? true;
    const allowOutbound = input.allowOutbound ?? true;
    const assignedUserId = input.assignedUserId?.trim() || actingUserId;

    // Resolve the optional number BEFORE touching Telnyx so we fail fast.
    let number: NumberPurchased | null = null;
    if (input.numberId) {
      number = await this.resolveAssignableNumber(
        ctx,
        input.numberId,
        allowInbound,
      );
    }

    const publicRef = await this.generatePublicRef();
    const sipUsername = await this.generateSipUsername(publicRef);
    const password = this.generatePassword();
    const connectionName = `Ringee Device - ${publicRef} - ${label}`.slice(
      0,
      100,
    );

    // 1) Create the Telnyx Credential Connection (with parking + shared OVP).
    const connection = await this.telnyx.createDeskPhoneConnection({
      connectionName,
      userName: sipUsername,
      password,
      webhookEventUrl: this.deskPhoneWebhookUrl(),
      outboundVoiceProfileId: ovp,
    });

    // 2) Persist the device. If this fails, tear down the orphan connection.
    let device: SipDeviceWithNumber;
    try {
      const created = await this.sipDeviceRepo.create({
        publicRef,
        label,
        deviceType: input.deviceType ?? null,
        provider: "telnyx",
        user: { connect: { id: assignedUserId } },
        organization: ctx.organizationId
          ? { connect: { id: ctx.organizationId } }
          : undefined,
        telnyxConnectionId: connection.connectionId,
        telnyxConnectionName: connection.connectionName,
        sipUsername,
        sipPasswordEncrypted: this.crypto.encrypt({ password }),
        outboundVoiceProfileId: ovp,
        parkOutboundEnabled: true,
        allowInbound,
        allowOutbound,
        inboundMode: NumberInboundMode.desk_phone_only,
        status: SipDeviceStatus.pending,
        callerId: number?.phoneNumber ?? null,
      });
      device = (await this.sipDeviceRepo.findById(created.id))!;
    } catch (error) {
      await this.telnyx
        .deleteDeskPhoneConnection(connection.connectionId)
        .catch(() => undefined);
      throw error;
    }

    // 3) Wire up the number: caller ID always; inbound routing only when asked.
    if (number) {
      await this.assignNumberToDevice(device.id, number, allowInbound);
      device = (await this.sipDeviceRepo.findById(device.id))!;
    }

    return {
      device: this.toView(device),
      credentials: this.buildCredentials(device, password),
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Mutations
  // ───────────────────────────────────────────────────────────────────────

  /** Rotate the SIP password. Returns fresh one-time credentials. */
  async regeneratePassword(
    ctx: OwnershipContext,
    id: string,
  ): Promise<CreatedSipDevice> {
    const device = await this.getOwnedDevice(ctx, id);
    if (device.status === SipDeviceStatus.deleted) {
      throw new BadRequestException("Cannot regenerate a deleted device.");
    }
    const password = this.generatePassword();
    await this.telnyx.updateDeskPhoneConnectionPassword(
      device.telnyxConnectionId,
      password,
    );
    const updated = await this.sipDeviceRepo.update(device.id, {
      sipPasswordEncrypted: this.crypto.encrypt({ password }),
      // Phone must re-register with the new password.
      status: SipDeviceStatus.pending,
      lastRegisteredAt: null,
    });
    const merged = { ...device, ...updated } as SipDeviceWithNumber;
    return {
      device: this.toView(merged),
      credentials: this.buildCredentials(merged, password),
    };
  }

  async setEnabled(
    ctx: OwnershipContext,
    id: string,
    enabled: boolean,
  ): Promise<SipDeviceView> {
    const device = await this.getOwnedDevice(ctx, id);
    if (device.status === SipDeviceStatus.deleted) {
      throw new BadRequestException("Cannot toggle a deleted device.");
    }
    await this.telnyx.setDeskPhoneConnectionActive(
      device.telnyxConnectionId,
      enabled,
    );
    const updated = await this.sipDeviceRepo.update(device.id, {
      status: enabled ? SipDeviceStatus.pending : SipDeviceStatus.disabled,
      ...(enabled ? {} : { lastRegisteredAt: null }),
    });
    return this.toView({ ...device, ...updated });
  }

  /**
   * Change (or clear) the device's assigned number. Restores the previous
   * number to Ringee inbound, then assigns the new number to this device.
   */
  async changeNumber(
    ctx: OwnershipContext,
    id: string,
    input: ChangeNumberInput,
  ): Promise<SipDeviceView> {
    const device = await this.getOwnedDevice(ctx, id);
    if (device.status === SipDeviceStatus.deleted) {
      throw new BadRequestException("Cannot change a deleted device's number.");
    }
    const allowInbound = input.allowInbound ?? device.allowInbound;

    // Resolve the new number first (fail fast before mutating anything).
    let next: NumberPurchased | null = null;
    if (input.numberId) {
      next = await this.resolveAssignableNumber(
        ctx,
        input.numberId,
        allowInbound,
      );
    }

    // Release the current number back to Ringee inbound, if any.
    await this.releaseAssignedNumber(device, NumberInboundMode.ringee_default);

    if (next) {
      await this.assignNumberToDevice(device.id, next, allowInbound);
    }
    if (allowInbound !== device.allowInbound) {
      await this.sipDeviceRepo.update(device.id, { allowInbound });
    }
    const fresh = (await this.sipDeviceRepo.findById(device.id))!;
    return this.toView(fresh);
  }

  /**
   * Delete a device. Tears down the Telnyx connection and decides what happens
   * to the assigned number's inbound routing (default: back to Ringee).
   */
  async delete(
    ctx: OwnershipContext,
    id: string,
    input: DeleteSipDeviceInput = {},
  ): Promise<{ deleted: true }> {
    const device = await this.getOwnedDevice(ctx, id);
    const reroute = input.reroute ?? "ringee";

    if (reroute === "device") {
      if (!input.targetDeviceId) {
        throw new BadRequestException(
          "targetDeviceId is required when rerouting inbound to another device.",
        );
      }
      const target = await this.getOwnedDevice(ctx, input.targetDeviceId);
      await this.moveNumberToDevice(device, target);
    } else {
      await this.releaseAssignedNumber(
        device,
        NumberInboundMode.ringee_default,
      );
    }

    await this.telnyx
      .deleteDeskPhoneConnection(device.telnyxConnectionId)
      .catch((err) =>
        this.logger.warn(
          `Telnyx delete connection failed for ${device.publicRef}: ${err.message}`,
        ),
      );
    await this.sipDeviceRepo.softDelete(device.id);
    return { deleted: true };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Webhook-facing helpers (registration telemetry)
  // ───────────────────────────────────────────────────────────────────────

  /** Mark a device registered from observed call activity / SIP telemetry. */
  async markRegistered(
    deviceId: string,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<void> {
    await this.sipDeviceRepo
      .update(deviceId, {
        status: SipDeviceStatus.registered,
        lastRegisteredAt: new Date(),
        ...(meta.ip ? { lastIpAddress: meta.ip } : {}),
        ...(meta.userAgent ? { lastUserAgent: meta.userAgent } : {}),
      })
      .catch((err) =>
        this.logger.warn(
          `markRegistered failed for device ${deviceId}: ${err.message}`,
        ),
      );
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  private assertFeatureEnabled(): void {
    if (!apiConfiguration.DESK_PHONES_ENABLED) {
      throw new ForbiddenException("Desk Phones are not enabled.");
    }
  }

  private deskPhoneWebhookUrl(): string {
    const base = apiConfiguration.PUBLIC_BACKEND_URL.replace(/\/+$/, "");
    return `${base}/api/webhooks/telnyx/desk-phone`;
  }

  private async getOwnedDevice(
    ctx: OwnershipContext,
    id: string,
  ): Promise<SipDeviceWithNumber> {
    const device = await this.sipDeviceRepo.findActiveById(id);
    if (!device) {
      throw new NotFoundException("Desk phone not found.");
    }
    const owned = ctx.organizationId
      ? device.organizationId === ctx.organizationId
      : device.userId === ctx.userId && !device.organizationId;
    if (!owned) {
      throw new ForbiddenException(
        "This desk phone belongs to another workspace.",
      );
    }
    return device;
  }

  /** Validate a number belongs to the workspace and may be assigned. */
  private async resolveAssignableNumber(
    ctx: OwnershipContext,
    numberId: string,
    requireInbound: boolean,
  ): Promise<NumberPurchased> {
    const number = await this.numberRepo.findById(numberId);
    if (!number || number.deletedAt) {
      throw new NotFoundException("Number not found.");
    }
    const owned = ctx.organizationId
      ? number.organizationId === ctx.organizationId
      : number.userId === ctx.userId && !number.organizationId;
    if (!owned) {
      throw new ForbiddenException("This number belongs to another workspace.");
    }
    // Only real purchased Telnyx DIDs can receive inbound on a SIP connection;
    // verified external caller IDs cannot be routed.
    if (requireInbound && number.kind !== NumberKind.purchased) {
      throw new BadRequestException(
        "Only purchased Ringee numbers can ring on a desk phone. Verified caller IDs are outbound-only.",
      );
    }
    return number;
  }

  /** Point a number at the device (caller ID always; inbound when allowed). */
  private async assignNumberToDevice(
    deviceId: string,
    number: NumberPurchased,
    routeInbound: boolean,
  ): Promise<void> {
    if (routeInbound) {
      await this.telnyx.assignNumberToConnection(
        number.phoneNumber,
        // Connection id lives on the device row — fetch lazily to avoid a stale
        // copy. The caller passes a fresh device, but re-read to be safe.
        (await this.sipDeviceRepo.findById(deviceId))!.telnyxConnectionId,
      );
    }
    await this.sipDeviceRepo.attachNumber({
      deviceId,
      numberId: number.id,
      callerId: number.phoneNumber,
      routeInbound,
    });
  }

  /** Detach the device's number and restore Ringee inbound routing. */
  private async releaseAssignedNumber(
    device: SipDeviceWithNumber,
    restore: NumberInboundMode,
  ): Promise<void> {
    const number = device.assignedNumber;
    if (!number) return;
    // Reassign the Telnyx number back to the shared Ringee connection so it
    // rings in Web/Extension/Mobile again.
    if (
      number.inboundMode === NumberInboundMode.desk_phone_only &&
      number.inboundSipDeviceId === device.id
    ) {
      await this.telnyx
        .assignNumberToConnection(
          number.phoneNumber,
          apiConfiguration.TELNYX_CONNECTION_ID,
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to reassign ${number.phoneNumber} to Ringee: ${err.message}`,
          ),
        );
    }
    await this.sipDeviceRepo.detachNumber({ deviceId: device.id, restore });
  }

  /** Move the device's number to another desk phone's connection. */
  private async moveNumberToDevice(
    from: SipDeviceWithNumber,
    to: SipDeviceWithNumber,
  ): Promise<void> {
    const number = from.assignedNumber;
    if (!number) return;
    await this.telnyx
      .assignNumberToConnection(number.phoneNumber, to.telnyxConnectionId)
      .catch((err) =>
        this.logger.warn(
          `Failed to move ${number.phoneNumber} to ${to.publicRef}: ${err.message}`,
        ),
      );
    await this.sipDeviceRepo.detachNumber({
      deviceId: from.id,
      restore: NumberInboundMode.desk_phone_only,
      targetDeviceId: to.id,
    });
    await this.sipDeviceRepo.update(to.id, {
      callerId: number.phoneNumber,
    });
  }

  private buildCredentials(
    device: SipDeviceWithNumber,
    password: string,
  ): SipDeviceCredentials {
    return {
      sipServer: SIP_SERVER,
      outboundProxy: SIP_SERVER,
      port: SIP_PORT,
      transport: "TLS",
      username: device.sipUsername,
      authId: device.sipUsername,
      password,
      callerId: device.callerId,
      inboundNumber: device.allowInbound
        ? (device.assignedNumber?.phoneNumber ?? null)
        : null,
      outboundEnabled: device.allowOutbound,
      inboundMode: "desk_phone_only",
    };
  }

  private toView(device: SipDeviceWithNumber): SipDeviceView {
    return {
      id: device.id,
      publicRef: device.publicRef,
      label: device.label,
      deviceType: device.deviceType,
      provider: device.provider,
      userId: device.userId,
      organizationId: device.organizationId,
      sipUsername: device.sipUsername,
      status: device.status,
      allowInbound: device.allowInbound,
      allowOutbound: device.allowOutbound,
      inboundMode: device.inboundMode,
      callerId: device.callerId,
      assignedNumber: device.assignedNumber
        ? {
            id: device.assignedNumber.id,
            phoneNumber: device.assignedNumber.phoneNumber,
          }
        : null,
      telnyxConnectionId: device.telnyxConnectionId,
      telnyxConnectionName: device.telnyxConnectionName,
      parkOutboundEnabled: device.parkOutboundEnabled,
      lastRegisteredAt: device.lastRegisteredAt,
      lastIpAddress: device.lastIpAddress,
      lastUserAgent: device.lastUserAgent,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }

  // ── Ref / credential generation ─────────────────────────────────────────

  private randomToken(len: number, alphabet: string): string {
    const bytes = randomBytes(len);
    let out = "";
    for (let i = 0; i < len; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  private async generatePublicRef(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const ref = `dev_${this.randomToken(8, REF_ALPHABET)}`;
      if (!(await this.sipDeviceRepo.publicRefExists(ref))) return ref;
    }
    throw new BadRequestException("Could not allocate a device reference.");
  }

  /**
   * Derive a Telnyx-valid SIP username from the public ref. Telnyx requires
   * 4–32 alphanumeric characters (no underscores), so we drop the `dev_`
   * separator and prefix with `rgdev`.
   */
  private async generateSipUsername(publicRef: string): Promise<string> {
    const token = publicRef.replace(/[^a-z0-9]/gi, "").replace(/^dev/, "");
    const base = `rgdev${token}`.slice(0, 32);
    if (!(await this.sipDeviceRepo.sipUsernameExists(base))) return base;
    // Extremely unlikely; fall back to a fresh random suffix.
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = `rgdev${this.randomToken(10, REF_ALPHABET)}`;
      if (!(await this.sipDeviceRepo.sipUsernameExists(candidate))) {
        return candidate;
      }
    }
    throw new BadRequestException("Could not allocate a SIP username.");
  }

  private generatePassword(): string {
    return this.randomToken(24, PASSWORD_ALPHABET);
  }
}
