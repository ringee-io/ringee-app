import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AiVoiceAgentType } from "@ringee/database";
import {
  VOICE_AGENT_BLUEPRINTS,
  type VoiceAgentBlueprint,
} from "../voice-agent.types";

/**
 * The blueprint registry. Everything that needs to know what an agent type is
 * — the create screen, the agent service, variable validation, the call path —
 * reads it from here, so there is one source of truth per type.
 */
@Injectable()
export class VoiceAgentBlueprintRegistry {
  private readonly byType: Map<AiVoiceAgentType, VoiceAgentBlueprint>;

  constructor(
    @Inject(VOICE_AGENT_BLUEPRINTS)
    blueprints: VoiceAgentBlueprint[],
  ) {
    this.byType = new Map(blueprints.map((b) => [b.type, b]));
  }

  all(): VoiceAgentBlueprint[] {
    return [...this.byType.values()];
  }

  get(type: AiVoiceAgentType): VoiceAgentBlueprint | undefined {
    return this.byType.get(type);
  }

  require(type: AiVoiceAgentType): VoiceAgentBlueprint {
    const blueprint = this.get(type);
    if (!blueprint) {
      throw new NotFoundException(`Unknown AI voice agent type: ${type}`);
    }
    return blueprint;
  }
}
