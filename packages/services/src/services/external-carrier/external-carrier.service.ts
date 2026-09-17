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
} from "@ringee/platform";
import {
  normalizeExternalNumber,
  normalizeSipInput,
  requireText,
  SipEndpointInput,
} from "./external-carrier.validation";

type Endpoint = ExternalCarrierWithEndpoints["endpoints"][number];

@Injectable()
export class ExternalCarrierService {
  private readonly logger = new Logger(ExternalCarrierService.name);
  constructor(
    private readonly repo: ExternalCarrierRepository,
    private readonly organizations: OrganizationRepository,
    private readonly telephony: TelephonyService,
    private readonly crypto: CryptoService,
  ) {}

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
    input: { endpointId: string; phoneNumber: string; active?: boolean },
    id?: string,
  ) {
    return this.mutate(ctx, carrierId, async (mutation, carrier) => {
      const endpoint = this.endpoint(carrier, input.endpointId);
      if (endpoint.syncStatus === "deleting")
        throw new ConflictException("This extension is being deleted.");
      if (
        id &&
        !carrier.endpoints.some((row) =>
          row.numbers.some((number) => number.id === id),
        )
      )
        throw new NotFoundException("External number not found.");
      if (input.active !== undefined && typeof input.active !== "boolean")
        throw new ConflictException("Invalid number state.");
      await this.repo.saveNumber(
        mutation,
        endpoint.id,
        {
          phoneNumber: normalizeExternalNumber(input.phoneNumber),
          active: input.active ?? true,
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
        syncStatus: "synced",
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
      await this.repo.updateEndpoint(mutation, endpoint.id, {
        syncStatus: "synced",
      });
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
          source: "external_carrier" as const,
          createdAt: number.createdAt,
          updatedAt: number.updatedAt,
        })),
      })),
    };
  }
}
