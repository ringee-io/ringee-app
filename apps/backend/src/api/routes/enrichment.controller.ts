import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { EnrichmentProviderType } from "@ringee/database";
import {
  EnrichmentConnectionService,
  EnrichmentService,
  LeadSearchService,
} from "@ringee/services";
import {
  createOwnershipContext,
  CurrentUser,
  CurrentUserData,
  EnrichmentProviderRegistry,
  LeadSearchFilters,
} from "@ringee/platform";
import { EnrichmentFeatureGuard } from "../guards/enrichment-feature.guard";

const VALID_PROVIDERS: EnrichmentProviderType[] = ["prospeo", "apollo"];

function assertProvider(p: string): EnrichmentProviderType {
  if (!VALID_PROVIDERS.includes(p as EnrichmentProviderType)) {
    throw new BadRequestException(`Invalid provider: ${p}`);
  }
  return p as EnrichmentProviderType;
}

@Controller("enrichment")
@UseGuards(EnrichmentFeatureGuard)
export class EnrichmentController {
  constructor(
    private readonly connections: EnrichmentConnectionService,
    private readonly enrichment: EnrichmentService,
    private readonly leadSearch: LeadSearchService,
    private readonly providerRegistry: EnrichmentProviderRegistry,
  ) {}

  // ── Provider catalog ──────────────────────────────────────────────

  @Get("providers")
  listProviders() {
    return this.providerRegistry.list().map((p) => ({
      type: p.type,
      capabilities: p.capabilities,
    }));
  }

  // ── Connections ───────────────────────────────────────────────────

  @Get("connections")
  async listConnections(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    const conns = await this.connections.listVisible(ctx);
    return conns.map((c) => ({
      id: c.id,
      provider: c.provider,
      scope: c.scope,
      status: c.status,
      externalAccountId: c.externalAccountId,
      externalAccountName: c.externalAccountName,
      lastErrorCode: c.lastErrorCode,
      lastErrorAt: c.lastErrorAt,
      lastUsedAt: c.lastUsedAt,
      providerMetadata: c.providerMetadata,
      capabilities: c.capabilities,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  @Delete("connections/:id")
  async disconnect(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    await this.connections.disconnect(ctx, id);
    return { ok: true };
  }

  @Post("connections/:id/forget")
  async forget(@Param("id") id: string, @CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    await this.connections.forget(ctx, id);
    return { ok: true };
  }

  @Get("connections/:id/credits")
  async getProviderCredits(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    const conn = await this.connections.findById(id);
    if (!conn) throw new BadRequestException("connection not found");
    // assertAccess via the disconnect path is overkill; reuse listVisible logic
    const visible = await this.connections.listVisible(ctx);
    if (!visible.find((c) => c.id === conn.id)) {
      throw new BadRequestException("connection not visible to user");
    }
    const provider = this.providerRegistry.get(conn.provider);
    if (!provider.getCredits) return { remaining: null, limit: null };
    const decrypted = await this.connections.decrypt(conn);
    return provider.getCredits({
      apiKey: decrypted.apiKey,
      accountId: conn.externalAccountId,
      connectionId: conn.id,
      metadata: decrypted.metadata,
    });
  }

  // ── Connect / validate ─────────────────────────────────────────────

  @Post(":provider/validate")
  async validate(
    @Param("provider") provider: string,
    @Body() body: { apiKey: string; metadata?: Record<string, unknown> },
  ) {
    const p = assertProvider(provider);
    if (!body?.apiKey) throw new BadRequestException("apiKey required");
    return this.connections.validateWithoutPersist(
      p,
      body.apiKey,
      body.metadata,
    );
  }

  @Post(":provider/connect")
  async connect(
    @Param("provider") provider: string,
    @Body() body: { apiKey: string; metadata?: Record<string, unknown> },
    @CurrentUser() user: CurrentUserData,
  ) {
    const p = assertProvider(provider);
    if (!body?.apiKey) throw new BadRequestException("apiKey required");
    const ctx = createOwnershipContext(user);
    const created = await this.connections.create(ctx, p, {
      apiKey: body.apiKey,
      metadata: body.metadata,
    });
    return { id: created.id, status: created.status };
  }

  // ── Enrich ────────────────────────────────────────────────────────

  @Post("contacts/:id/enrich")
  async enrichOne(
    @Param("id") contactId: string,
    @Body()
    body: {
      provider?: EnrichmentProviderType;
      waterfall?: boolean;
      revealPhone?: boolean;
      revealEmail?: boolean;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.enrichment.enrichContact(ctx, contactId, {
      providerPreference: body?.provider,
      waterfall: body?.waterfall,
      revealPhone: body?.revealPhone,
      revealEmail: body?.revealEmail,
    });
  }

  @Post("contacts/enrich-bulk")
  async enrichBulk(
    @Body()
    body: {
      contactIds: string[];
      provider?: EnrichmentProviderType;
      waterfall?: boolean;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!Array.isArray(body?.contactIds)) {
      throw new BadRequestException("contactIds must be an array");
    }
    const ctx = createOwnershipContext(user);
    return this.enrichment.enrichContactsBulk(ctx, body.contactIds, {
      providerPreference: body.provider,
      waterfall: body.waterfall,
    });
  }

  @Get("jobs/:id")
  async getJob(@Param("id") id: string) {
    return this.enrichment.getJob(id);
  }

  @Get("contacts/:id/jobs")
  async listContactJobs(
    @Param("id") contactId: string,
    @Query("limit") limit?: string,
  ) {
    return this.enrichment.listJobsForContact(
      contactId,
      limit ? Number(limit) : undefined,
    );
  }

  // ── Lead Search ────────────────────────────────────────────────────

  @Post("leads/search")
  async searchLeads(
    @Body()
    body: {
      filters: LeadSearchFilters;
      provider?: EnrichmentProviderType;
      page?: number;
      perPage?: number;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body?.filters) throw new BadRequestException("filters required");
    const ctx = createOwnershipContext(user);
    return this.leadSearch.searchLeads(ctx, body.filters, {
      provider: body.provider,
      page: body.page,
      perPage: body.perPage,
    });
  }

  @Post("leads/import")
  async importLeads(
    @Body()
    body: {
      candidates: Parameters<LeadSearchService["importLeads"]>[1];
      tagIds?: string[];
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!Array.isArray(body?.candidates)) {
      throw new BadRequestException("candidates must be an array");
    }
    const ctx = createOwnershipContext(user);
    return this.leadSearch.importLeads(ctx, body.candidates, {
      tagIds: body.tagIds,
    });
  }

  @Post("leads/jobs/:jobId/candidates/:externalId/reveal")
  async revealLeadCandidate(
    @Param("jobId") jobId: string,
    @Param("externalId") externalId: string,
    @Body() body: { revealPhone?: boolean } | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.leadSearch.revealCandidate(ctx, jobId, externalId, {
      revealPhone: body?.revealPhone ?? false,
    });
  }

  @Get("leads/jobs")
  async listLeadJobs(
    @Query("limit") limit: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.leadSearch.listJobs(ctx, limit ? Number(limit) : undefined);
  }

  @Get("leads/jobs/:id")
  async getLeadJob(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.leadSearch.getJob(id, ctx);
  }
}
