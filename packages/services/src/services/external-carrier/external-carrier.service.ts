import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ExternalCallingRoute,
  ExternalCarrierRepository,
  ExternalCarrierWithEndpoints,
  ExternalSipEndpoint,
  OrganizationRepository,
  CarrierMutation,
  Prisma,
} from "@ringee/database";
import {
  CarrierConnectionConfig,
  CarrierConnectionError,
  CryptoService,
  OwnershipContext,
  TelephonyService,
  TelephonyEvent,
  isCarrierRouteKey,
  signCarrierRouteKey,
  verifyCarrierRouteKey,
} from "@ringee/platform";
import { apiConfiguration } from "@ringee/configuration";
import { SipDeviceService } from "../sip-device/sip-device.service";
import { sipUser } from "./sip-target";
import {
  normalizeExternalNumber,
  normalizeSipInput,
  requireText,
  SipEndpointInput,
} from "./external-carrier.validation";

type Endpoint = ExternalCarrierWithEndpoints["endpoints"][number];

/**
 * Custom SIP header a PBX adds to name the external number that was called
 * when several numbers share one extension. It selects among that extension's
 * own numbers and grants nothing else.
 */
export const CALLED_NUMBER_HEADER = "x-ringee-called-number";

/** A browser must place its authorized carrier leg within two minutes. */
export const EXTERNAL_PRE_DIAL_TTL_MS = 2 * 60 * 1000;

export type CarrierInboundRoute =
  | { kind: "none" }
  | { kind: "refused"; reason: string }
  | {
      kind: "desk_phone";
      /** The desk phone owner's organization workspace. */
      ctx: OwnershipContext & { organizationId: string };
      /** The caller as reported, E.164 when it is one. */
      fromNumber: string;
      /** The caller's E.164 number, or null when it has none to present. */
      callerId: string | null;
      /** The external number that was called. */
      toNumber: string;
      externalCarrierId: string;
      externalSipEndpointId: string;
      sipDeviceId: string;
      sipUsername: string;
    };

/** Strict E.164 or null: a caller ID is presented as given or not at all. */
function e164(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(compact) ? compact : null;
}

@Injectable()
export class ExternalCarrierService {
  private readonly logger = new Logger(ExternalCarrierService.name);
  constructor(
    private readonly repo: ExternalCarrierRepository,
    private readonly organizations: OrganizationRepository,
    private readonly telephony: TelephonyService,
    private readonly crypto: CryptoService,
    private readonly sipDevices: SipDeviceService,
  ) {}

  /** Desk phones an external number's inbound calls may be routed to. */
  async listInboundDeskPhones(ctx: OwnershipContext) {
    const owner = await this.authorize(ctx);
    if (!apiConfiguration.DESK_PHONES_ENABLED) return [];
    const [devices, members] = await Promise.all([
      this.sipDevices.list(owner),
      this.organizations.listMembersWithUsers(owner.organizationId),
    ]);
    const owners = new Map(
      members.flatMap((member) =>
        member.user
          ? [
              [
                member.user.id,
                [member.user.firstName, member.user.lastName]
                  .filter(Boolean)
                  .join(" ") ||
                  member.user.emails[0]?.email ||
                  null,
              ] as const,
            ]
          : [],
      ),
    );
    return devices
      .filter(
        (device) =>
          owners.has(device.userId) &&
          device.allowInbound &&
          device.status !== "disabled" &&
          device.status !== "deleted",
      )
      .map((device) => ({
        id: device.id,
        label: device.label,
        ownerName: owners.get(device.userId) ?? null,
      }));
  }

  /**
   * Who takes a call the Call Control application received. A call from a
   * carrier's PBX is addressed with the signed routing key of the endpoint it
   * came through; anything else is not a carrier call (`none`). A carrier call
   * that cannot be delivered is `refused`, never guessed at: the called number
   * must be unambiguous and its desk phone usable, in the same organization.
   */
  async resolveInbound(event: TelephonyEvent): Promise<CarrierInboundRoute> {
    const appId = apiConfiguration.TELNYX_CALL_CONTROL_APP_ID;
    const key = sipUser(event.to);
    if (!appId || event.connectionId !== appId || !isCarrierRouteKey(key))
      return { kind: "none" };
    const refused = (reason: string): CarrierInboundRoute => ({
      kind: "refused",
      reason,
    });

    const endpointId = verifyCarrierRouteKey(key);
    if (!endpointId) return refused("the routing key does not verify");
    const endpoint = await this.repo.findInboundRoute(endpointId);
    if (
      !endpoint ||
      endpoint.carrier.organizationId !== endpoint.organizationId ||
      endpoint.carrier.status !== "active" ||
      endpoint.syncStatus !== "synced" ||
      !endpoint.providerConnectionId
    )
      return refused("its SIP endpoint is not active");

    const numbers = endpoint.numbers.filter(
      (number) => number.organizationId === endpoint.organizationId,
    );
    const named = event.customHeaders.filter(
      (header) => header.name.toLowerCase() === CALLED_NUMBER_HEADER,
    );
    let number: (typeof numbers)[number] | undefined;
    if (named.length > 1) return refused("the PBX named several numbers");
    if (named.length === 1) {
      // The header only selects among this verified endpoint's own numbers;
      // it can never reach a number anywhere else.
      const called = e164(sipUser(named[0].value));
      number = numbers.find((row) => row.phoneNumber === called);
      if (!number) return refused("the named number is not on this extension");
    } else if (numbers.length === 1) {
      number = numbers[0];
    } else {
      return refused(
        `${numbers.length} numbers share this extension and the PBX did not name the called one`,
      );
    }

    // Inactive numbers still count when deciding whether a DID is ambiguous.
    // Otherwise disabling one of two DIDs would deliver its calls to the other.
    if (!number.active) return refused("the called number is inactive");
    const device = number.inboundSipDevice;
    if (!device) return refused("the called number is not routed inbound");
    if (
      !apiConfiguration.DESK_PHONES_ENABLED ||
      device.deletedAt ||
      device.organizationId !== endpoint.organizationId ||
      !device.allowInbound ||
      device.status === "disabled" ||
      device.status === "deleted" ||
      !(await this.organizations.isMember(
        device.userId,
        endpoint.organizationId,
      ))
    )
      return refused("its desk phone cannot take calls");

    const caller = sipUser(event.from);
    return {
      kind: "desk_phone",
      ctx: { userId: device.userId, organizationId: endpoint.organizationId },
      fromNumber: e164(caller) ?? caller,
      callerId: e164(caller),
      toNumber: number.phoneNumber,
      externalCarrierId: endpoint.carrierId,
      externalSipEndpointId: endpoint.id,
      sipDeviceId: device.id,
      sipUsername: device.sipUsername,
    };
  }

  /** Any member may call through the organization's carriers; admins manage them. */
  private async authorizeCalling(ctx: OwnershipContext) {
    if (
      !ctx.organizationId ||
      !(await this.organizations.isMember(ctx.userId, ctx.organizationId))
    )
      throw new ForbiddenException(
        "External carrier calling requires an organization workspace.",
      );
    return { ...ctx, organizationId: ctx.organizationId };
  }

  async listCallingNumbers(ctx: OwnershipContext) {
    if (!ctx.organizationId) return [];
    const owner = await this.authorizeCalling(ctx);
    return (await this.repo.listCallingNumbers(owner)).map((number) => ({
      ...number,
      source: "external_carrier" as const,
      isoCountry: "",
      status: "active",
    }));
  }

  /**
   * The persisted half of an outbound route: the number is this workspace's,
   * active, and on a synchronized endpoint of an active carrier. Another
   * organization's number is indistinguishable from a missing one.
   */
  private usableRoute(number: ExternalCallingRoute | null) {
    if (!number) throw new NotFoundException("External number not found.");
    const { endpoint } = number;
    if (
      !number.active ||
      endpoint.carrier.status !== "active" ||
      endpoint.syncStatus !== "synced" ||
      !endpoint.providerConnectionId
    )
      throw new ConflictException(
        "This external number's connection is unavailable. Synchronize its extension and retry.",
      );
    return {
      fromNumber: number.phoneNumber,
      endpoint: {
        ...endpoint,
        providerConnectionId: endpoint.providerConnectionId,
      },
    };
  }

  /**
   * Pre-dial resolution for a call from an external number. Only this server
   * talks to the provider; the caller receives the SIP destination to dial and
   * nothing about the connection's credentials or PBX identity.
   */
  async resolveOutbound(
    ctx: OwnershipContext,
    numberId: string,
    destination: string,
  ) {
    const owner = await this.authorizeCalling(ctx);
    const toNumber = normalizeExternalNumber(destination);
    const { fromNumber, endpoint } = this.usableRoute(
      await this.repo.findCallingRoute(owner, { id: numberId }),
    );
    let registration, dial;
    try {
      [registration, dial] = await Promise.all([
        this.telephony.checkCarrierRegistration(endpoint.providerConnectionId),
        this.telephony.getCarrierDialDestination(
          endpoint.providerConnectionId,
          toNumber,
        ),
      ]);
    } catch (error) {
      if (error instanceof CarrierConnectionError)
        throw new BadGatewayException(
          "The external carrier is unavailable. Please retry later.",
        );
      throw error;
    }
    if (registration.status !== "registered")
      throw new ConflictException(
        "The external carrier is not registered. Check its extension and retry.",
      );
    if (!dial)
      throw new ConflictException(
        "This external number's connection is unavailable. Synchronize its extension and retry.",
      );
    if (dial.fqdn !== endpoint.providerFqdn)
      await this.repo.recordProviderFqdn(
        owner,
        endpoint.id,
        dial.fqdn,
        endpoint.providerConnectionId,
      );
    return {
      fromNumber,
      toNumber,
      destinationUri: dial.uri,
      externalCarrierId: endpoint.carrierId,
      externalSipEndpointId: endpoint.id,
    };
  }

  /**
   * Re-checks, from Ringee's own records only, that a route handed out moments
   * ago still stands when its leg reaches the provider. Returns the SIP host
   * the leg must be addressed to, or null when the route no longer holds.
   */
  async confirmOutboundRoute(
    ctx: OwnershipContext,
    route: { fromNumber: string; externalSipEndpointId: string },
  ): Promise<string | null> {
    try {
      const owner = await this.authorizeCalling(ctx);
      const { endpoint } = this.usableRoute(
        await this.repo.findCallingRoute(owner, {
          phoneNumber: route.fromNumber,
          endpointId: route.externalSipEndpointId,
        }),
      );
      return endpoint.providerFqdn;
    } catch {
      return null;
    }
  }

  /** Whether a SIP host is one of the carrier connections Ringee manages. */
  isCarrierHost(host: string) {
    return this.repo.isProviderFqdn(host.toLowerCase());
  }

  private async authorize(
    ctx: OwnershipContext,
  ): Promise<OwnershipContext & { organizationId: string }> {
    if (!ctx.organizationId)
      throw new ForbiddenException(
        "External carriers require an organization workspace.",
      );
    const memberships = await this.organizations.findMembershipsByUserId(
      ctx.userId,
    );
    if (
      !memberships.some(
        (m) =>
          m.organizationId === ctx.organizationId &&
          ["org:admin", "admin"].includes(m.role),
      )
    ) {
      throw new ForbiddenException(
        "Only organization admins can manage external carriers.",
      );
    }
    return { ...ctx, organizationId: ctx.organizationId };
  }

  async list(ctx: OwnershipContext) {
    const owner = await this.authorize(ctx);
    return (await this.repo.list(owner)).map((row) => this.view(row));
  }

  async createCarrier(ctx: OwnershipContext, name: string) {
    const owner = await this.authorize(ctx);
    return this.view(
      await this.repo.create(owner, requireText(name, "carrier name", 80)),
    );
  }

  async updateCarrier(ctx: OwnershipContext, carrierId: string, name: string) {
    return this.mutate(ctx, carrierId, async (mutation) => {
      await this.repo.updateCarrier(mutation, {
        name: requireText(name, "carrier name", 80),
      });
    });
  }

  async createEndpoint(
    ctx: OwnershipContext,
    carrierId: string,
    input: SipEndpointInput,
  ) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const config = normalizeSipInput(input, true);
      if (carrier.endpoints.some((row) => row.extension === config.extension))
        throw new ConflictException(
          "This extension already exists. Edit or retry its connection.",
        );
      // The local reference exists BEFORE POST, including if the process crashes.
      const endpoint = await this.repo.createEndpoint(mutation, {
        ...config,
        id: randomUUID(),
        sipPasswordEncrypted: this.crypto.encrypt({ password: input.password }),
      });
      await this.synchronize(mutation, endpoint, true);
    });
  }

  async updateEndpoint(
    ctx: OwnershipContext,
    carrierId: string,
    id: string,
    input: SipEndpointInput,
  ) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const endpoint = this.endpoint(carrier, id);
      if (endpoint.syncStatus === "deleting")
        throw new ConflictException("Finish deleting this extension first.");
      const config = normalizeSipInput(input, false);
      // Keep the previous creation outcome until the provider ID is recovered.
      const updated = await this.repo.updateEndpoint(mutation, id, {
        ...config,
        ...(input.password !== undefined
          ? {
              sipPasswordEncrypted: this.crypto.encrypt({
                password: input.password,
              }),
            }
          : {}),
        ...(endpoint.providerConnectionId ? { syncStatus: "pending" } : {}),
        registrationStatus: "unknown",
        lastCheckedAt: null,
      });
      await this.synchronize(mutation, updated);
    });
  }

  async syncEndpoint(ctx: OwnershipContext, carrierId: string, id: string) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const endpoint = this.endpoint(carrier, id);
      if (endpoint.syncStatus === "deleting")
        throw new ConflictException("Finish deleting this extension first.");
      await this.synchronize(mutation, endpoint);
    });
  }

  async refreshRegistration(
    ctx: OwnershipContext,
    carrierId: string,
    id: string,
  ) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const endpoint = this.endpoint(carrier, id);
      if (!endpoint.providerConnectionId || endpoint.syncStatus !== "synced")
        throw new ConflictException(
          "Synchronize the extension before checking registration.",
        );
      await this.refresh(mutation, endpoint);
    });
  }

  async saveNumber(
    ctx: OwnershipContext,
    carrierId: string,
    input: {
      endpointId: string;
      phoneNumber: string;
      active?: boolean;
      /** The desk phone inbound calls ring; null stops routing them. */
      inboundSipDeviceId?: string | null;
    },
    id?: string,
  ) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const endpoint = this.endpoint(carrier, input.endpointId);
      if (endpoint.syncStatus === "deleting")
        throw new ConflictException("This extension is being deleted.");
      const previous = carrier.endpoints
        .flatMap((row) => row.numbers)
        .find((number) => number.id === id);
      if (id && !previous)
        throw new NotFoundException("External number not found.");
      if (input.active !== undefined && typeof input.active !== "boolean")
        throw new ConflictException("Invalid number state.");
      const phoneNumber = normalizeExternalNumber(input.phoneNumber);
      const deviceId =
        input.inboundSipDeviceId === undefined
          ? (previous?.inboundSipDeviceId ?? null)
          : input.inboundSipDeviceId;
      // Routing is (re)applied when a phone is chosen or a routed number moves
      // to another extension; other edits leave the provider alone.
      if (
        deviceId &&
        (input.inboundSipDeviceId || previous?.endpointId !== endpoint.id)
      ) {
        if (!endpoint.providerConnectionId || endpoint.syncStatus !== "synced")
          throw new ConflictException(
            "Synchronize the extension before routing its incoming calls.",
          );
        if (input.inboundSipDeviceId)
          await this.sipDevices.prepareForCarrierInbound(mutation, deviceId);
        await this.telephony.configureCarrierInbound(
          endpoint.providerConnectionId,
          signCarrierRouteKey(endpoint.id),
        );
      }
      await this.repo.saveNumber(
        mutation,
        endpoint.id,
        {
          phoneNumber,
          active: input.active ?? true,
          inboundSipDeviceId: input.inboundSipDeviceId,
        },
        id,
      );
    });
  }

  async deleteNumber(ctx: OwnershipContext, carrierId: string, id: string) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      if (
        !carrier.endpoints.some((row) =>
          row.numbers.some((number) => number.id === id),
        )
      )
        throw new NotFoundException("External number not found.");
      await this.repo.deleteNumber(mutation, id);
    });
  }

  async deleteEndpoint(ctx: OwnershipContext, carrierId: string, id: string) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const endpoint = this.endpoint(carrier, id);
      if (endpoint.numbers.length)
        throw new ConflictException(
          "Remove or reassign this extension's numbers first.",
        );
      await this.removeRemote(mutation, endpoint);
      await this.repo.deleteEndpoint(mutation, id);
    });
  }

  async deleteCarrier(ctx: OwnershipContext, carrierId: string) {
    await this.mutate(
      ctx,
      carrierId,
      async (mutation, carrier) => {
        // A partial delete stays visible and blocks new configuration. Repeating
        // DELETE finishes cleanup; upstream 404 is the desired outcome.
        await this.repo.updateCarrier(mutation, { status: "deleting" });
        for (const endpoint of carrier.endpoints) {
          if (!(await this.repo.renew(mutation)))
            throw new ConflictException(
              "The operation expired. Retry deletion.",
            );
          await this.removeRemote(mutation, endpoint);
        }
        await this.repo.deleteCarrier(mutation);
      },
      true,
    );
    return { deleted: true };
  }

  private reference(endpoint: ExternalSipEndpoint) {
    return `ringee-byoc-${endpoint.id}`;
  }

  private providerConfig(
    endpoint: ExternalSipEndpoint,
  ): CarrierConnectionConfig {
    const { password } = this.crypto.decrypt(endpoint.sipPasswordEncrypted);
    return {
      reference: this.reference(endpoint),
      proxy: endpoint.proxy,
      username: endpoint.sipUsername,
      password,
      transport: endpoint.transport as CarrierConnectionConfig["transport"],
      authUsername: endpoint.authUsername,
      fromUser: endpoint.fromUser,
      outboundProxy: endpoint.outboundProxy,
      expirationSec: endpoint.expirationSec,
    };
  }

  private async recoverId(mutation: CarrierMutation, endpoint: Endpoint) {
    if (endpoint.providerConnectionId) return endpoint.providerConnectionId;
    const found = await this.telephony.findCarrierConnection(
      this.reference(endpoint),
    );
    if (!found)
      throw new ConflictException(
        "The previous connection request is unresolved. Retry synchronization later or contact support with this extension's reference.",
      );
    await this.repo.updateEndpoint(mutation, endpoint.id, {
      providerConnectionId: found.id,
    });
    return found.id;
  }

  private async synchronize(
    mutation: CarrierMutation,
    endpoint: Endpoint,
    firstAttempt = false,
  ) {
    let id = endpoint.providerConnectionId;
    if (!id && !firstAttempt && endpoint.syncStatus !== "error")
      id = await this.recoverId(mutation, endpoint);
    if (!id) {
      // Written before every create, so a crash/retry cannot send a second POST.
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        syncStatus: "pending",
        registrationStatus: "unknown",
      });
      let created;
      try {
        created = await this.telephony.createCarrierConnection(
          this.providerConfig(endpoint),
        );
      } catch (error) {
        await this.repo.updateEndpoint(mutation, endpoint.id, {
          syncStatus:
            error instanceof CarrierConnectionError && !error.uncertain
              ? "error"
              : "unknown",
        });
        throw error;
      }
      id = created.id;
      // If this write fails, the durable UUID/name recovers the remote resource.
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        providerConnectionId: id,
        syncStatus: "pending",
        ...(created.fqdn ? { providerFqdn: created.fqdn } : {}),
      });
    } else {
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        syncStatus: "pending",
        registrationStatus: "unknown",
      });
      try {
        await this.telephony.updateCarrierConnection(
          id,
          this.providerConfig(endpoint),
        );
      } catch (error) {
        await this.repo.updateEndpoint(mutation, endpoint.id, {
          syncStatus: "error",
        });
        throw error;
      }
    }
    try {
      // Also refresh older/recovered connections: their host must be protected
      // before the first dial, not only after a browser has requested a route.
      const connection = await this.telephony.getCarrierConnection(id);
      if (!connection.fqdn) throw new CarrierConnectionError(false);
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        providerFqdn: connection.fqdn,
      });
      if (endpoint.numbers.some((number) => number.inboundSipDeviceId))
        await this.telephony.configureCarrierInbound(
          id,
          signCarrierRouteKey(endpoint.id),
        );
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        syncStatus: "synced",
      });
    } catch (error) {
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        syncStatus: "error",
      });
      throw error;
    }
    // Registration failure is not configuration failure. Keep the connection.
    await this.refresh(mutation, { ...endpoint, providerConnectionId: id });
  }

  private async refresh(mutation: CarrierMutation, endpoint: Endpoint) {
    try {
      const state = await this.telephony.checkCarrierRegistration(
        endpoint.providerConnectionId!,
      );
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        registrationStatus: state.status,
        providerStatus: state.providerStatus,
        lastRegisteredAt: state.lastRegisteredAt,
        lastCheckedAt: new Date(),
        lastIpAddress: state.ipAddress,
        lastPort: state.port,
        lastTransport: state.transport,
      });
    } catch (error) {
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        registrationStatus: "unknown",
        lastCheckedAt: new Date(),
      });
      throw error;
    }
  }

  private async removeRemote(mutation: CarrierMutation, endpoint: Endpoint) {
    const id =
      endpoint.providerConnectionId ??
      (endpoint.syncStatus === "error"
        ? null
        : await this.recoverId(mutation, endpoint));
    if (!id) return;
    await this.repo.updateEndpoint(mutation, endpoint.id, {
      syncStatus: "deleting",
      registrationStatus: "unknown",
    });
    await this.telephony.deleteCarrierConnection(id);
  }

  private endpoint(carrier: ExternalCarrierWithEndpoints, id: string) {
    const endpoint = carrier.endpoints.find((row) => row.id === id);
    if (!endpoint) throw new NotFoundException("SIP extension not found.");
    return endpoint;
  }

  private async mutate(
    ctx: OwnershipContext,
    carrierId: string,
    operation: (
      mutation: CarrierMutation,
      carrier: ExternalCarrierWithEndpoints,
    ) => Promise<void>,
    deleting = false,
  ) {
    const owner = await this.authorize(ctx);
    if (!(await this.repo.find(owner, carrierId)))
      throw new NotFoundException("External carrier not found.");
    const mutation = { ...owner, carrierId, token: randomUUID() };
    if (!(await this.repo.acquire(mutation)))
      throw new ConflictException(
        "Another carrier change is in progress. Try again shortly.",
      );
    try {
      const carrier = await this.repo.find(owner, carrierId);
      if (!carrier) throw new NotFoundException("External carrier not found.");
      if (!deleting && carrier.status !== "active")
        throw new ConflictException("Finish deleting this carrier first.");
      await operation(mutation, carrier);
      const updated = await this.repo.find(owner, carrierId);
      return updated ? this.view(updated) : null;
    } catch (error) {
      if (error instanceof CarrierConnectionError)
        throw new BadGatewayException(
          "The carrier provider could not complete the request. Review the saved extension and retry.",
        );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "This extension or phone number already exists in the workspace.",
        );
      throw error;
    } finally {
      await this.repo
        .release(mutation)
        .catch(() =>
          this.logger.warn(`Carrier operation lease will expire: ${carrierId}`),
        );
    }
  }

  /** Explicit allowlist: neither ciphertext nor SIP passwords cross the API. */
  private view(carrier: ExternalCarrierWithEndpoints) {
    return {
      id: carrier.id,
      name: carrier.name,
      status: carrier.status,
      source: "external_carrier" as const,
      createdAt: carrier.createdAt,
      updatedAt: carrier.updatedAt,
      endpoints: carrier.endpoints.map((row) => ({
        id: row.id,
        extension: row.extension,
        proxy: row.proxy,
        sipUsername: row.sipUsername,
        authUsername: row.authUsername,
        fromUser: row.fromUser,
        outboundProxy: row.outboundProxy,
        transport: row.transport,
        expirationSec: row.expirationSec,
        syncStatus: row.syncStatus,
        registrationStatus: row.registrationStatus,
        lastRegisteredAt: row.lastRegisteredAt,
        lastCheckedAt: row.lastCheckedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        numbers: row.numbers.map((number) => ({
          id: number.id,
          phoneNumber: number.phoneNumber,
          active: number.active,
          inboundSipDeviceId: number.inboundSipDeviceId,
          source: "external_carrier" as const,
          createdAt: number.createdAt,
          updatedAt: number.updatedAt,
        })),
      })),
    };
  }
}
