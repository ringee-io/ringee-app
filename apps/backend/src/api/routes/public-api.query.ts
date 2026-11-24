import { BadRequestException } from "@nestjs/common";

/** A page or limit query parameter: a whole number from 1, optionally capped. */
export function parsePositiveInteger(
  raw: string | undefined,
  field: string,
  max?: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    (max !== undefined && value > max)
  ) {
    throw new BadRequestException(
      max
        ? `${field} must be a whole number between 1 and ${max}`
        : `${field} must be a positive whole number`,
    );
  }
  return value;
}
