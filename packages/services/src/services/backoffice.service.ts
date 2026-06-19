import { BadRequestException, Injectable } from "@nestjs/common";
import {
  AccountDetail,
  AccountListResult,
  AccountType,
  BackofficeDashboard,
  BackofficeRepository,
  CreditRepository,
  AiPipelineActivationRepository,
  NumberListItem,
  NumberPurchased,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import {
  CallRecordingSettingsService,
  UpdateRecordingSettingsInput,
} from "./transcription";
import { PipelineRegistry } from "./ai-pipeline/pipeline.registry";
import {
  PipelineContext,
  contextKey,
  contextOwnerColumns,
  toContextTypeEnum,
} from "./ai-pipeline/pipeline-context";
import { PipelineType } from "./ai-pipeline/ai-pipeline.types";

export interface AccountDetailDto extends Omit<AccountDetail, "pipelineRows"> {
  pipelines: {
    type: PipelineType;
    name: string;
    implemented: boolean;
    enabled: boolean;
  }[];
}

export type CreditEditMode = "set" | "adjust";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Orchestrates the internal super-admin (backoffice) operations. Reads come
 * from BackofficeRepository; mutations reuse the existing domain code by
 * building a TARGET OwnershipContext for the customer being administered (rather
 * than the acting admin's own context).
 */
@Injectable()
export class BackofficeService {
  constructor(
    private readonly repo: BackofficeRepository,
    private readonly creditRepository: CreditRepository,
    private readonly recordingSettingsService: CallRecordingSettingsService,
    private readonly activationRepo: AiPipelineActivationRepository,
    private readonly registry: PipelineRegistry,
  ) {}

  /** Target ownership context for the account being administered. */
  private targetCtx(type: AccountType, id: string): OwnershipContext {
    return type === "org"
      ? { userId: "", organizationId: id }
      : { userId: id, organizationId: null };
  }

  // ── Dashboard & listing ────────────────────────────────────

  getDashboard(start: Date, end: Date): Promise<BackofficeDashboard> {
    return this.repo.getDashboard(start, end);
  }

  listAccounts(params: {
    type: AccountType;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<AccountListResult> {
    const take = Math.min(Math.max(params.pageSize, 1), 100);
    const skip = Math.max(params.page - 1, 0) * take;
    return this.repo.listAccounts({
      type: params.type,
      search: params.search,
      skip,
      take,
    });
  }

  async getAccount(type: AccountType, id: string): Promise<AccountDetailDto> {
    const { pipelineRows, ...rest } = await this.repo.getAccount(type, id);
    const enabledByEnum = new Map(
      pipelineRows.map((r) => [r.pipelineType, r.enabled]),
    );
    const pipelines = this.registry.all().map((def) => ({
      type: def.type,
      name: def.name,
      implemented: def.implemented,
      enabled: enabledByEnum.get(def.pipelineEnum) ?? false,
    }));
    return { ...rest, pipelines };
  }

  // ── Credit ─────────────────────────────────────────────────

  async setCredit(
    type: AccountType,
    id: string,
    input: { mode: CreditEditMode; amount: number },
  ): Promise<{ balance: number }> {
    if (input.mode === "set" && input.amount < 0) {
      throw new BadRequestException(
        "Balance cannot be set to a negative value",
      );
    }
    const ctx = this.targetCtx(type, id);
    const current = await this.creditRepository.getBalance(ctx);
    const delta = input.mode === "set" ? input.amount - current : input.amount;
    const credit = await this.creditRepository.updateBalance(ctx, delta);
    return { balance: round2(credit.amount) };
  }

  // ── Recording / transcription settings ─────────────────────

  updateRecordingSettings(
    type: AccountType,
    id: string,
    input: UpdateRecordingSettingsInput,
  ) {
    // Super admin acts with full authority over org settings.
    return this.recordingSettingsService.update(
      this.targetCtx(type, id),
      input,
      { isOrgAdmin: true },
    );
  }

  // ── AI pipeline activation ─────────────────────────────────

  async setAiPipeline(
    type: AccountType,
    id: string,
    enabled: boolean,
    pipelineType?: PipelineType,
  ): Promise<{ enabled: boolean; pipelines: PipelineType[] }> {
    const context: PipelineContext =
      type === "org"
        ? { type: "organization_outside_campaign", organizationId: id }
        : { type: "personal", userId: id };

    const key = contextKey(context);
    const ctxType = toContextTypeEnum(context);
    const owner = contextOwnerColumns(context);

    const defs = pipelineType
      ? [this.registry.require(pipelineType)]
      : this.registry.all();

    await Promise.all(
      defs.map((def) =>
        this.activationRepo.setEnabled({
          pipelineType: def.pipelineEnum,
          contextType: ctxType,
          contextKey: key,
          owner,
          enabled,
        }),
      ),
    );

    return { enabled, pipelines: defs.map((d) => d.type) };
  }

  // ── Numbers ────────────────────────────────────────────────

  listNumbers(params: {
    status: "available" | "assigned" | "all";
    search?: string;
  }): Promise<NumberListItem[]> {
    return this.repo.listNumbers(params);
  }

  async assignNumber(
    type: AccountType,
    id: string,
    numberId: string,
  ): Promise<NumberPurchased> {
    if (type === "org") {
      const ownerUserId = await this.repo.resolveOrgOwnerUserId(id);
      if (!ownerUserId) {
        throw new BadRequestException(
          "Organization has no members to own the number",
        );
      }
      return this.repo.adminAssign(numberId, {
        userId: ownerUserId,
        organizationId: id,
      });
    }
    return this.repo.adminAssign(numberId, {
      userId: id,
      organizationId: null,
    });
  }

  unassignNumber(numberId: string): Promise<NumberPurchased> {
    return this.repo.adminUnassign(numberId);
  }
}
