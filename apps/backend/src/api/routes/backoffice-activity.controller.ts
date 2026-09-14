import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { BackofficeActivityService } from "@ringee/services";
import type { VoiceAgentTypeFilter } from "@ringee/database";
import { SuperAdminOnly } from "../guards/super-admin.guard";
import { parseAccountFilter, parseRange } from "./backoffice-filters";

const AGENT_TYPES: VoiceAgentTypeFilter[] = [
  "appointment_booking",
  "reminders_notifications",
];

function parseAgentType(value?: string): VoiceAgentTypeFilter | undefined {
  if (!value || value === "all") return undefined;
  if (!AGENT_TYPES.includes(value as VoiceAgentTypeFilter)) {
    throw new BadRequestException(
      `type must be one of all, ${AGENT_TYPES.join(", ")}`,
    );
  }
  return value as VoiceAgentTypeFilter;
}

/**
 * Cross-tenant meetings, callbacks and AI voice agent activity for the internal
 * super-admin area. Gated by the email allowlist via @SuperAdminOnly() — this
 * is the real access boundary; the frontend gate is UX only.
 */
@Controller("backoffice/activity")
@SuperAdminOnly()
export class BackofficeActivityController {
  constructor(private readonly activity: BackofficeActivityService) {}

  @Get()
  overview(
    @Query()
    q: {
      start?: string;
      end?: string;
      userId?: string;
      organizationId?: string;
    },
  ) {
    const { start, end } = parseRange(q);
    return this.activity.getActivity(start, end, parseAccountFilter(q));
  }

  @Get("voice-agent-calls")
  voiceAgentCalls(
    @Query()
    q: {
      start?: string;
      end?: string;
      type?: string;
      userId?: string;
      organizationId?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const { start, end } = parseRange(q);
    return this.activity.listVoiceAgentCalls({
      start,
      end,
      type: parseAgentType(q.type),
      ...parseAccountFilter(q),
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 25,
    });
  }
}
