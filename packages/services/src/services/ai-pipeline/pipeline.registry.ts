import { Inject, Injectable } from "@nestjs/common";
import { AiPipelineType } from "@ringee/database";
import {
  AiPipelineDefinition,
  PIPELINE_DEFINITIONS,
  PipelineType,
} from "./ai-pipeline.types";

/**
 * The pipeline registry. Definitions are collected via the PIPELINE_DEFINITIONS
 * multi-provider so the runner, the cards page, the counter fan-out and the
 * scheduler all iterate the same source of truth. Adding a pipeline = implement
 * its AiPipelineDefinition and add it to the PIPELINE_DEFINITIONS factory (one
 * line) — nothing in the core changes.
 */
@Injectable()
export class PipelineRegistry {
  private readonly byType: Map<PipelineType, AiPipelineDefinition>;
  private readonly byEnum: Map<AiPipelineType, AiPipelineDefinition>;

  constructor(
    @Inject(PIPELINE_DEFINITIONS)
    private readonly definitions: AiPipelineDefinition[],
  ) {
    this.byType = new Map(definitions.map((d) => [d.type, d]));
    this.byEnum = new Map(definitions.map((d) => [d.pipelineEnum, d]));
  }

  all(): AiPipelineDefinition[] {
    return [...this.byType.values()];
  }

  get(type: PipelineType): AiPipelineDefinition | undefined {
    return this.byType.get(type);
  }

  getByEnum(pipelineEnum: AiPipelineType): AiPipelineDefinition | undefined {
    return this.byEnum.get(pipelineEnum);
  }

  require(type: PipelineType): AiPipelineDefinition {
    const def = this.get(type);
    if (!def) throw new Error(`Unknown pipeline: ${type}`);
    return def;
  }
}
