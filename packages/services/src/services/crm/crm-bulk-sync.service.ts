import { Injectable, Logger } from "@nestjs/common";
import {
  CrmConnection,
  CrmConnectionRepository,
} from "@ringee/database";
import {
  CrmProviderRegistry,
  OwnershipContext,
  CrmError,
} from "@ringee/platform";
import { CrmConnectionService } from "./crm-connection.service";
import { CrmContactSyncService } from "./crm-contact-sync.service";
import { CrmCompanySyncService } from "./crm-company-sync.service";

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const THROTTLE_MS = 200;

@Injectable()
export class CrmBulkSyncService {
  private readonly logger = new Logger(CrmBulkSyncService.name);
  private inFlight = false;

  constructor(
    private readonly registry: CrmProviderRegistry,
    private readonly connectionRepo: CrmConnectionRepository,
    private readonly connectionService: CrmConnectionService,
    private readonly contactSync: CrmContactSyncService,
    private readonly companySync: CrmCompanySyncService,
  ) {}

  async syncAllActiveConnections(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const connections = await this.connectionRepo.listAllActive();
      for (const conn of connections) {
        await this.syncConnection(conn).catch((err) => {
          this.logger.error(
            `BulkSync failed for connection ${conn.id}: ${err instanceof Error ? err.message : err}`,
          );
        });
      }
    } finally {
      this.inFlight = false;
    }
  }

  async syncConnection(connection: CrmConnection): Promise<{
    contacts: { synced: number; created: number; errors: number };
    companies: { synced: number; created: number; errors: number };
  }> {
    const provider = this.registry.get(connection.provider);
    const ctx = this.buildOwnershipContext(connection);

    let decrypted = await this.connectionService.getValidCredentials(connection);
    let creds = {
      accessToken: decrypted.accessToken,
      refreshToken: decrypted.refreshToken,
      accountId: connection.externalAccountId,
      connectionId: connection.id,
    };

    const withAuthRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof CrmError && err.code === "AUTH_EXPIRED") {
          decrypted = await this.connectionService.forceRefresh(decrypted.connection);
          creds = {
            accessToken: decrypted.accessToken,
            refreshToken: decrypted.refreshToken,
            accountId: decrypted.connection.externalAccountId,
            connectionId: decrypted.connection.id,
          };
          return fn();
        }
        throw err;
      }
    };

    const result = {
      contacts: { synced: 0, created: 0, errors: 0 },
      companies: { synced: 0, created: 0, errors: 0 },
    };

    if (provider.listCompanies) {
      this.logger.log(`BulkSync: syncing companies for connection ${connection.id}`);
      let pageToken: string | null = null;
      let pages = 0;

      do {
        try {
          const page = await withAuthRetry(() =>
            provider.listCompanies!(creds, pageToken, PAGE_SIZE),
          );
          for (const companyResult of page.data) {
            try {
              const r = await this.companySync.upsertCompany(connection, companyResult, ctx);
              result.companies.synced++;
              if (r.created) result.companies.created++;
            } catch (err) {
              result.companies.errors++;
              this.logger.warn(
                `BulkSync company error: ${err instanceof Error ? err.message : err}`,
              );
            }
          }
          pageToken = page.nextPageToken;
          pages++;
          if (pageToken) await this.throttle();
        } catch (err) {
          this.handleProviderError(connection, err);
          break;
        }
      } while (pageToken && pages < MAX_PAGES);
    }

    if (provider.listPersons) {
      this.logger.log(`BulkSync: syncing contacts for connection ${connection.id}`);
      let pageToken: string | null = null;
      let pages = 0;

      do {
        try {
          const page = await withAuthRetry(() =>
            provider.listPersons!(creds, pageToken, PAGE_SIZE),
          );
          for (const contactResult of page.data) {
            try {
              const r = await this.contactSync.upsertContact(connection, contactResult, ctx);
              result.contacts.synced++;
              if (r.created) result.contacts.created++;
            } catch (err) {
              result.contacts.errors++;
              this.logger.warn(
                `BulkSync contact error: ${err instanceof Error ? err.message : err}`,
              );
            }
          }
          pageToken = page.nextPageToken;
          pages++;
          if (pageToken) await this.throttle();
        } catch (err) {
          this.handleProviderError(connection, err);
          break;
        }
      } while (pageToken && pages < MAX_PAGES);
    }

    await this.connectionService.touchLastSync(connection.id);
    this.logger.log(
      `BulkSync completed for ${connection.id}: ` +
        `contacts(synced=${result.contacts.synced},created=${result.contacts.created},errors=${result.contacts.errors}) ` +
        `companies(synced=${result.companies.synced},created=${result.companies.created},errors=${result.companies.errors})`,
    );

    return result;
  }

  private buildOwnershipContext(connection: CrmConnection): OwnershipContext {
    return {
      userId: connection.userId,
      organizationId: connection.organizationId,
    };
  }

  private async handleProviderError(
    connection: CrmConnection,
    err: unknown,
  ): Promise<void> {
    if (
      err instanceof CrmError &&
      (err.code === "AUTH_REVOKED" || err.code === "AUTH_EXPIRED")
    ) {
      await this.connectionService.markStatus(connection.id, "revoked", err.code);
      this.logger.error(`BulkSync: connection ${connection.id} revoked (${err.code})`);
    } else {
      this.logger.error(
        `BulkSync page error for ${connection.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private throttle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
  }
}
