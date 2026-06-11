import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Client, Connection } from "@temporalio/client";
import { apiConfiguration } from "@ringee/configuration";

/**
 * Lazy singleton Temporal client. The connection is established on first use
 * (not on module init) so apps still boot when Temporal is briefly
 * unreachable — individual enqueues fail loudly instead.
 */
@Injectable()
export class TemporalClientService implements OnModuleDestroy {
  private readonly logger = new Logger(TemporalClientService.name);
  private clientPromise?: Promise<Client>;

  getClient(): Promise<Client> {
    this.clientPromise ??= (async () => {
      const connection = await Connection.connect({
        address: apiConfiguration.TEMPORAL_ADDRESS,
      });
      this.logger.log(
        `Connected to Temporal at ${apiConfiguration.TEMPORAL_ADDRESS} (namespace: ${apiConfiguration.TEMPORAL_NAMESPACE})`,
      );
      return new Client({
        connection,
        namespace: apiConfiguration.TEMPORAL_NAMESPACE,
      });
    })().catch((err) => {
      // Reset so the next call retries instead of caching the failure forever.
      this.clientPromise = undefined;
      throw err;
    });
    return this.clientPromise;
  }

  async onModuleDestroy() {
    if (!this.clientPromise) return;
    try {
      const client = await this.clientPromise;
      await client.connection.close();
    } catch {
      // Connection never established or already closed — nothing to clean up.
    }
  }
}
