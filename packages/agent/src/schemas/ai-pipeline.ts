import { z } from "zod";
import {
  aiPipelineTypeEnum,
  pendingActionStatusEnum,
  pipelineContextTypeEnum,
  uuid,
} from "./common.js";

export const ListAiPipelinesSchema = z.object({});

export const GetAiPipelineResultsSchema = z
  .object({
    pipeline: aiPipelineTypeEnum,
    contextType: pipelineContextTypeEnum.describe(
      "Which slice of data the pipeline analysed. Each context is analysed " +
        "and enabled independently.",
    ),
    campaignId: uuid.optional(),
    status: pendingActionStatusEnum
      .optional()
      .describe("Filter the returned actions. Defaults to pending."),
  })
  .refine((v) => v.contextType !== "campaign" || !!v.campaignId, {
    message: "campaignId is required when contextType is 'campaign'.",
    path: ["campaignId"],
  });

export type ListAiPipelinesInput = z.infer<typeof ListAiPipelinesSchema>;
export type GetAiPipelineResultsInput = z.infer<
  typeof GetAiPipelineResultsSchema
>;
