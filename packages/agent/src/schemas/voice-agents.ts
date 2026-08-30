import { z } from "zod";
import { phoneNumber, uuid } from "./common.js";

export const ListAiVoiceAgentsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const StartAiVoiceAgentCallSchema = z.object({
  agentId: uuid,
  to: phoneNumber,
  fromNumberId: uuid.optional(),
  /**
   * The agent type decides which names are accepted; list_ai_voice_agents
   * reports them. Unknown names are rejected server-side rather than silently
   * dropped, so a typo surfaces instead of leaving a hole in what is said.
   */
  variables: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GetAiVoiceAgentCallSchema = z.object({
  callId: uuid,
});

export type ListAiVoiceAgentsInput = z.infer<typeof ListAiVoiceAgentsSchema>;
export type StartAiVoiceAgentCallInput = z.infer<
  typeof StartAiVoiceAgentCallSchema
>;
export type GetAiVoiceAgentCallInput = z.infer<
  typeof GetAiVoiceAgentCallSchema
>;
