import { z } from "zod";
import {
  analyticsBlockEnum,
  callOutcomeEnum,
  calendarDate,
  campaignFilter,
  dashboardRangeEnum,
  isoDateTime,
  utcOffset,
  uuid,
} from "./common.js";

export const GetCallAnalyticsSchema = z.object({
  range: dashboardRangeEnum
    .optional()
    .describe("Preset window. Ignored when from/to are supplied."),
  from: isoDateTime.optional().describe("Custom window start. Pair with `to`."),
  to: isoDateTime.optional().describe("Custom window end. Pair with `from`."),
  campaignId: campaignFilter.optional(),
  outcome: callOutcomeEnum.optional(),
  scope: z.enum(["personal", "organization"]).optional(),
  memberUserId: uuid
    .optional()
    .describe("Narrow to one member (organization admins only)."),
  include: z
    .array(analyticsBlockEnum)
    .min(1)
    .optional()
    .describe('Defaults to ["kpis","funnel","by-outcome"].'),
});

export const GetDayActivitySchema = z.object({
  date: calendarDate,
  utcOffset: utcOffset.optional().describe("Defaults to +00:00 (UTC)."),
  campaignId: campaignFilter.optional(),
  outcome: z.array(callOutcomeEnum).min(1).optional(),
  includeCallbacks: z.boolean().optional(),
  includeMeetings: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type GetCallAnalyticsInput = z.infer<typeof GetCallAnalyticsSchema>;
export type GetDayActivityInput = z.infer<typeof GetDayActivitySchema>;
