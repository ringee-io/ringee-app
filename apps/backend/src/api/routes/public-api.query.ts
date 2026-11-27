import { BadRequestException } from "@nestjs/common";

/**
 * The most rows a page may skip: PostgreSQL's integer range, which the
 * database and its client accept as an offset whatever the column.
 */
const MAX_OFFSET = 2_147_483_647;

/** A page or limit query parameter: a whole number from 1, optionally capped. */
export function parsePositiveInteger(
  raw: string | undefined,
  field: string,
  max?: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
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

/**
 * `page` and `limit` together. Each is checked alone, and so is what they ask
 * for together: a page that is valid by itself can still skip more rows than
 * the database can be asked to (`page=99999999999&limit=100`), which would
 * otherwise fail inside the query as a 500. An absent limit is counted at its
 * cap, the most the route's own default can be.
 */
export function parsePagination(
  pageRaw: string | undefined,
  limitRaw: string | undefined,
  options: { maxLimit: number },
): { page: number | undefined; limit: number | undefined } {
  const page = parsePositiveInteger(pageRaw, "page");
  const limit = parsePositiveInteger(limitRaw, "limit", options.maxLimit);
  const perPage = limit ?? options.maxLimit;
  const skip = ((page ?? 1) - 1) * perPage;
  if (!Number.isSafeInteger(skip) || skip > MAX_OFFSET) {
    throw new BadRequestException(
      `page is too large: with ${perPage} per page it can be at most ${Math.floor(MAX_OFFSET / perPage) + 1}`,
    );
  }
  return { page, limit };
}
