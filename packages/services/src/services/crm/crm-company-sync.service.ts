import { Injectable, Logger } from "@nestjs/common";
import {
  CrmConnection,
  CompanyRepository,
  CrmCompanyLinkRepository,
  ContactAffiliationRepository,
} from "@ringee/database";
import {
  CrmProviderRegistry,
  CrmCompanySyncResult,
  OwnershipContext,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";

@Injectable()
export class CrmCompanySyncService {
  private readonly logger = new Logger(CrmCompanySyncService.name);

  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly connections: CrmConnectionService,
    private readonly companyRepo: CompanyRepository,
    private readonly linkRepo: CrmCompanyLinkRepository,
    private readonly affiliationRepo: ContactAffiliationRepository,
  ) {}

  async syncFromCrm(
    connection: CrmConnection,
    externalId: string,
    ctx: OwnershipContext,
  ): Promise<{ companyId: string; created: boolean }> {
    const provider = this.registry.get(connection.provider);
    if (!provider.fetchCompany) {
      throw new Error(`${connection.provider} does not support fetchCompany`);
    }

    const decrypted = await this.connections.decrypt(connection);
    const creds = {
      accessToken: decrypted.accessToken,
      refreshToken: decrypted.refreshToken,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
    };

    const result = await provider.fetchCompany(creds, externalId);
    return this.upsertCompany(connection, result, ctx);
  }

  async upsertCompany(
    connection: CrmConnection,
    result: CrmCompanySyncResult,
    ctx: OwnershipContext,
  ): Promise<{ companyId: string; created: boolean }> {
    const existingLink = await this.linkRepo.findByExternalId(
      connection.id,
      "company",
      result.company.externalId,
    );

    if (existingLink?.companyId) {
      await this.updateExisting(existingLink.companyId, result);
      await this.touchLink(connection, result, existingLink.companyId);
      return { companyId: existingLink.companyId, created: false };
    }

    let existing = result.domain
      ? await this.companyRepo.findByDomain(ctx, result.domain)
      : null;

    if (!existing) {
      existing = await this.companyRepo.findByName(ctx, result.name);
    }

    if (existing) {
      await this.updateExisting(existing.id, result);
      await this.touchLink(connection, result, existing.id);
      return { companyId: existing.id, created: false };
    }

    const company = await this.companyRepo.create(ctx, {
      name: result.name,
      domain: result.domain,
      industry: result.industry,
      size: result.size,
      phone: result.phone,
      website: result.website,
      source: `crm:${connection.provider}`,
      crmMetadata: { lastSyncedFrom: connection.provider, externalId: result.company.externalId },
    });

    await this.touchLink(connection, result, company.id);
    return { companyId: company.id, created: true };
  }

  async linkContactToCompany(
    contactId: string,
    companyId: string,
    opts: { role?: string; isPrimary?: boolean } = {},
  ): Promise<void> {
    await this.affiliationRepo.upsert({
      contactId,
      companyId,
      role: opts.role,
      isPrimary: opts.isPrimary,
    });
  }

  private async updateExisting(companyId: string, result: CrmCompanySyncResult): Promise<void> {
    await this.companyRepo.update(companyId, {
      name: result.name,
      domain: result.domain ?? undefined,
      industry: result.industry ?? undefined,
      size: result.size ?? undefined,
      phone: result.phone ?? undefined,
      website: result.website ?? undefined,
    });
  }

  private async touchLink(
    connection: CrmConnection,
    result: CrmCompanySyncResult,
    companyId: string,
  ): Promise<void> {
    await this.linkRepo.upsertLink({
      connectionId: connection.id,
      provider: connection.provider,
      externalId: result.company.externalId,
      externalType: "company",
      companyId,
      domain: result.domain,
      matchConfidence: "crm_sync",
      rawSnapshot: (result.raw ?? null) as Record<string, unknown> | null,
    });
  }
}
