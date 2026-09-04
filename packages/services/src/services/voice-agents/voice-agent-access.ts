import { ForbiddenException } from "@nestjs/common";
import type { OwnershipContext } from "@ringee/platform";

/** Whether the active workspace may use the AI Voice Agents module. */
export function hasVoiceAgentAccess(
  ctx: Pick<OwnershipContext, "organizationId">,
): boolean {
  return Boolean(ctx.organizationId);
}

/**
 * AI Voice Agents are an organization capability. Keep this domain gate in the
 * shared service layer so REST, MCP and CLI consumers cannot disagree.
 */
export function assertVoiceAgentAccess(
  ctx: Pick<OwnershipContext, "organizationId">,
): asserts ctx is { organizationId: string } {
  if (!hasVoiceAgentAccess(ctx)) {
    throw new ForbiddenException(
      "AI Voice Agents require an active organization workspace",
    );
  }
}
