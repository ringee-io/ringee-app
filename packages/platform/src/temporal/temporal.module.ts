import { Module } from "@nestjs/common";
import { TemporalClientService } from "./temporal-client.service";
import { OrchestratorService } from "./orchestrator.service";

@Module({
  providers: [TemporalClientService, OrchestratorService],
  exports: [TemporalClientService, OrchestratorService],
})
export class TemporalModule {}
