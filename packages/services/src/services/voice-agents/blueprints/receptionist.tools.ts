import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";
import { voiceAgentWebhookHeaders } from "./human-support.tool";

/**
 * The directory and transfer tools only the receptionist blueprint carries.
 * Their handlers accept a call only while it is the inbound call routed to
 * this agent (`VoiceAgentToolService.authorizeReceptionist`).
 */
export function buildReceptionistTools(
  ctx: VoiceAgentToolContext,
): VoiceAgentTool[] {
  const shared = {
    kind: "webhook" as const,
    method: "POST" as const,
    headers: voiceAgentWebhookHeaders(ctx),
  };
  return [
    {
      ...shared,
      name: "search_directory",
      description:
        "Look up current Ringee users, ring groups and internal user extensions. Returns logical identifiers only. Ask for clarification when there are several matches or has_more is true.",
      url: `${ctx.toolBaseUrl}/${ctx.agentId}/directory`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            maxLength: 200,
            description:
              "Person or department name, or exact internal extension.",
          },
        },
        required: ["query"],
      },
    },
    {
      ...shared,
      name: "transfer_to_destination",
      description:
        "Transfer this live inbound call to one destination just returned by search_directory. Never guess an identifier. Ringee handles all browser and desk phone routing.",
      url: `${ctx.toolBaseUrl}/${ctx.agentId}/transfer`,
      parameters: {
        type: "object",
        properties: {
          destination_type: {
            type: "string",
            enum: ["user", "ring_group", "extension"],
          },
          destination_id: { type: "string", format: "uuid" },
        },
        required: ["destination_type", "destination_id"],
      },
    },
  ];
}
