import { Injectable } from "@nestjs/common";
import {
  BackofficeAccountFilter,
  BackofficeActivity,
  BackofficeActivityRepository,
  VoiceAgentCallsResult,
  VoiceAgentTypeFilter,
} from "@ringee/database";

export interface ListVoiceAgentCallsInput extends BackofficeAccountFilter {
  start: Date;
  end: Date;
  type?: VoiceAgentTypeFilter;
  page: number;
  pageSize: number;
}

/**
 * Read-only meetings, callbacks and AI voice agent analytics for the
 * backoffice. Every method is cross-tenant — the SuperAdminGuard on the
 * controller is the access boundary.
 */
@Injectable()
export class BackofficeActivityService {
  constructor(private readonly repo: BackofficeActivityRepository) {}

  getActivity(
    start: Date,
    end: Date,
    filter: BackofficeAccountFilter = {},
  ): Promise<BackofficeActivity> {
    return this.repo.getActivity(start, end, filter);
  }

  listVoiceAgentCalls(
    input: ListVoiceAgentCallsInput,
  ): Promise<VoiceAgentCallsResult> {
    const take = Math.min(Math.max(input.pageSize, 1), 100);
    const skip = Math.max(input.page - 1, 0) * take;
    return this.repo.listVoiceAgentCalls({
      start: input.start,
      end: input.end,
      type: input.type,
      userId: input.userId,
      organizationId: input.organizationId,
      skip,
      take,
    });
  }
}
