import { Injectable, Logger } from "@nestjs/common";
import { EnrichmentService } from "./enrichment.service";

@Injectable()
export class EnrichmentDrainService {
  private readonly logger = new Logger(EnrichmentDrainService.name);

  constructor(private readonly enrichment: EnrichmentService) {}

  async drain(batchSize = 25): Promise<number> {
    try {
      return await this.enrichment.drain(batchSize);
    } catch (err) {
      this.logger.error(`drain error: ${(err as Error).message}`);
      return 0;
    }
  }
}
