import { BadRequestException } from "@nestjs/common";
import { isUUID } from "class-validator";
import type { BackofficeAccountFilter } from "@ringee/database";

/**
 * Query parsing shared by the backoffice analytics controllers (dashboard,
 * campaigns, meetings & AI agents), so every page reads the same date range
 * and the same client / organization filter the same way.
 */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Default window when no range is supplied: today so far. */
export function parseRange(q: { start?: string; end?: string }): {
  start: Date;
  end: Date;
} {
  const end = q.end ? new Date(q.end) : new Date();
  const start = q.start ? new Date(q.start) : startOfDay(end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException("Invalid start/end date");
  }
  return { start, end };
}

/** The ids are cast to uuid in SQL — reject anything else as a 400, not a 500. */
function parseUuid(name: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (!isUUID(value)) {
    throw new BadRequestException(`${name} must be a UUID`);
  }
  return value;
}

/**
 * `userId` narrows to one client. `organizationId` is an organization id,
 * `none` for personal (no organization) activity, or `all` / absent for no
 * filter. The two combine: a client inside one organization.
 */
export function parseAccountFilter(q: {
  userId?: string;
  organizationId?: string;
}): BackofficeAccountFilter {
  const org = q.organizationId;
  return {
    userId: parseUuid("userId", q.userId),
    organizationId:
      !org || org === "all"
        ? undefined
        : org === "none"
          ? "none"
          : parseUuid("organizationId", org),
  };
}
