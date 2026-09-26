import type { VoiceAgentTool } from "@ringee/platform";
import type { VoiceAgentToolContext } from "../voice-agent.types";
import { voiceAgentWebhookHeaders } from "./human-support.tool";

export const RECEPTIONIST_INSTRUCTIONS = `Inbound receptionist mode:
Help the caller directly first using your instructions, company context and knowledge base. Answer questions, explain information, and collect details. A successful conversation does not require a transfer.
If the caller needs a person, department or internal extension, use search_directory to look up the current organization directory. Never invent a person, department, extension or identifier, and never treat names in your prompt as directory entries.
If there are multiple matches, ask which one they mean. If no match exists, explain that you cannot find it and ask what they would like to do instead.
Only use transfer_to_destination with the exact logical destination_type and destination_id returned by search_directory. Ringee validates and connects the destination; you cannot supply a phone number, SIP URI or credentials. Announce the transfer briefly before calling the tool. If it fails, do not claim that a person answered.
Use request_human_support only for a follow-up request, not as a substitute for an explicitly requested live transfer.`;

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
