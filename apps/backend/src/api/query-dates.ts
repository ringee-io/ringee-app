import { BadRequestException } from "@nestjs/common";
import { isISO8601 } from "class-validator";

/**
 * An optional ISO 8601 query parameter as a `Date`; anything else is a 400.
 * `new Date` alone also reads "1" or "Oct 30 2026", and rolls Feb 30 into
 * March.
 */
export function parseOptionalIsoDate(
  value: string | undefined,
  name: string,
): Date | undefined {
  if (!value) return undefined;
  const date = isISO8601(value, { strict: true }) ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${name} must be an ISO 8601 date`);
  }
  return date;
}

/**
 * One edge of a date window (`from`, `to`): like `parseOptionalIsoDate`, but
 * sent empty (`?from=`) it is a 400 — a window asked for without its edge
 * must not quietly become unbounded. Omitted is still no bound.
 */
export function parseIsoDateBound(
  value: string | undefined,
  name: string,
): Date | undefined {
  if (value === "") {
    throw new BadRequestException(`${name} must be an ISO 8601 date`);
  }
  return parseOptionalIsoDate(value, name);
}
