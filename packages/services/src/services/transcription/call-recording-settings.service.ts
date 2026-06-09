import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import {
  CallRecordingSettings,
  CallRecordingSettingsRepository,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

/**
 * Effective, resolved recording/transcription preferences for a call context.
 * Always concrete booleans — never null — so callers don't re-implement the
 * default rule.
 */
export interface EffectiveRecordingSettings {
  recordAllCalls: boolean;
  transcribeRealtime: boolean;
  transcribeRecordings: boolean;
}

export interface UpdateRecordingSettingsInput {
  recordAllCalls?: boolean;
  transcribeRealtime?: boolean;
  transcribeRecordings?: boolean;
}

const DEFAULTS: EffectiveRecordingSettings = {
  recordAllCalls: false,
  transcribeRealtime: false,
  transcribeRecordings: false,
};

@Injectable()
export class CallRecordingSettingsService {
  private readonly logger = new Logger(CallRecordingSettingsService.name);

  constructor(private readonly repo: CallRecordingSettingsRepository) {}

  /**
   * Resolve the settings row that governs a context.
   *
   * Rule (no override/merge between user and org):
   *  - organizationId present  → the organization's settings win.
   *  - organizationId absent    → the user's personal settings are used.
   */
  async resolve(ctx: OwnershipContext): Promise<EffectiveRecordingSettings> {
    const row = ctx.organizationId
      ? await this.repo.findByOrganization(ctx.organizationId)
      : await this.repo.findByUser(ctx.userId);

    if (!row) return { ...DEFAULTS };

    return {
      recordAllCalls: row.recordAllCalls,
      transcribeRealtime: row.transcribeRealtime,
      transcribeRecordings: row.transcribeRecordings,
    };
  }

  /**
   * Read the raw settings row for the context for the settings UI. Returns the
   * effective defaults when no row exists yet.
   */
  async getForContext(ctx: OwnershipContext): Promise<EffectiveRecordingSettings> {
    return this.resolve(ctx);
  }

  /**
   * Update settings for the context. For an organization context only an org
   * admin may write — otherwise the call is rejected. Personal settings are
   * always writable by their owner.
   */
  async update(
    ctx: OwnershipContext,
    input: UpdateRecordingSettingsInput,
    actor: { isOrgAdmin: boolean },
  ): Promise<EffectiveRecordingSettings> {
    if (ctx.organizationId && !actor.isOrgAdmin) {
      throw new ForbiddenException(
        "Only organization admins can change recording settings",
      );
    }

    const data = {
      ...(input.recordAllCalls !== undefined && {
        recordAllCalls: input.recordAllCalls,
      }),
      ...(input.transcribeRealtime !== undefined && {
        transcribeRealtime: input.transcribeRealtime,
      }),
      ...(input.transcribeRecordings !== undefined && {
        transcribeRecordings: input.transcribeRecordings,
      }),
    };

    let saved: CallRecordingSettings;
    if (ctx.organizationId) {
      saved = await this.repo.upsertForOrganization(ctx.organizationId, data);
    } else {
      saved = await this.repo.upsertForUser(ctx.userId, data);
    }

    this.logger.log(
      `Updated recording settings for ${
        ctx.organizationId ? `org=${ctx.organizationId}` : `user=${ctx.userId}`
      }`,
    );

    return {
      recordAllCalls: saved.recordAllCalls,
      transcribeRealtime: saved.transcribeRealtime,
      transcribeRecordings: saved.transcribeRecordings,
    };
  }
}
