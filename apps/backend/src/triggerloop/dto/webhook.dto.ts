import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  TRIGGERLOOP_ACTION_TYPES,
  TRIGGERLOOP_SUBJECT_TYPES,
  TRIGGERLOOP_WEBHOOK_OPERATIONS,
  TriggerLoopActionType,
  TriggerLoopOperation,
  TriggerLoopSubjectType,
} from "../types/triggerloop.types";

export class WebhookSubjectDto {
  @IsIn(TRIGGERLOOP_SUBJECT_TYPES as unknown as string[])
  type!: TriggerLoopSubjectType;

  @IsString()
  id!: string;
}

export class WebhookStateDto {
  @IsOptional()
  @IsString()
  currentStepKey!: string | null;

  @IsArray()
  @IsString({ each: true })
  sentStepKeys!: string[];

  @IsArray()
  @IsString({ each: true })
  sentActionKeys!: string[];

  @IsInt()
  @Min(0)
  executionCount!: number;
}

export class WebhookActionDto {
  @IsIn(TRIGGERLOOP_ACTION_TYPES as unknown as string[])
  type!: TriggerLoopActionType;

  @IsString()
  actionKey!: string;

  @IsBoolean()
  allowRepeat!: boolean;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class TriggerLoopWebhookDto {
  @IsIn(TRIGGERLOOP_WEBHOOK_OPERATIONS as unknown as string[])
  operation!: TriggerLoopOperation;

  @IsString()
  projectKey!: string;

  @IsString()
  workflowKey!: string;

  @IsString()
  workflowInstanceId!: string;

  @ValidateNested()
  @Type(() => WebhookSubjectDto)
  subject!: WebhookSubjectDto;

  // evaluate only
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookStateDto)
  state?: WebhookStateDto;

  // executeAction only
  @IsOptional()
  @IsString()
  stepExecutionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookActionDto)
  action?: WebhookActionDto;
}
