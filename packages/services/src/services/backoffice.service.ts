import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import {
  AccountDetail,
  AccountListResult,
  AccountType,
  BackofficeDashboard,
  BackofficeRepository,
  CreditRepository,
  AiPipelineActivationRepository,
  NumberInventoryStatus,
  NumberListItem,
  NumberPurchased,
  NumberPurchasedRepository,
  NumberRegistration,
  Prisma,
} from "@ringee/database";
import { OwnershipContext, RedisService } from "@ringee/platform";
import { resolveRegion } from "./caller-id-rotation/destination-region";
import { inboundRouteLockKey } from "./inbound-routing/inbound-route-lock";
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
import {
  UserGeneralSettings,
  UserService,
  UpdateUserGeneralSettingsInput,
} from "./user.service";

export interface AccountDetailDto extends Omit<AccountDetail, "pipelineRows"> {
  pipelines: {
    type: PipelineType;
    name: string;
    implemented: boolean;
    enabled: boolean;
  }[];
}

export type CreditEditMode = "set" | "adjust";

/** One request registers at most this many numbers. */
export const MAX_NUMBERS_PER_REGISTRATION = 50;

/**
 * `existing`: it was already in the inventory — and, when the request named an
 * account, unassigned, so it was assigned instead.
 */
export type NumberRegistrationOutcome =
  | "added"
  | "restored"
  | "existing"
  | "failed";

export interface NumberRegistrationResult {
  /** E.164 once it could be read; as typed otherwise. */
  phoneNumber: string;
  outcome: NumberRegistrationOutcome;
  numberId: string | null;
  /** Whether it is now assigned to the account the request named. */
  assigned: boolean;
  error: string | null;
}

/** Who holds a number assigned to an account. */
interface NumberOwner {
  userId: string;
  organizationId: string | null;
}

/** Telnyx's `phone_number_type` names, which purchased numbers carry. */
const NUMBER_TYPES: Record<string, string> = {
  FIXED_LINE: "local",
  FIXED_LINE_OR_MOBILE: "local",
  MOBILE: "mobile",
  TOLL_FREE: "toll_free",
};

/**
 * A number the backoffice can register: international format only — a country
 * is never guessed for a national number — filed under the country it belongs
 * to. `resolveRegion` also knows US overlays newer than libphonenumber.
 */
function parseRegistrableNumber(raw: string): NumberRegistration | null {
  const international = raw.trim().replace(/^(?:00|011)(?=\s*\d)/, "+");
  if (!international.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(international, { extract: false });
  if (!parsed?.isPossible()) return null;

  const type = parsed.getType();
  const isoCountry =
    resolveRegion(parsed.number).country ??
    // NANP toll-free belongs to no single country; it is filed under US.
    (parsed.countryCallingCode === "1" && type === "TOLL_FREE" ? "US" : null);
  if (!isoCountry) return null;

  return {
    phoneNumber: parsed.number,
    isoCountry,
    phoneNumberType: (type && NUMBER_TYPES[type]) ?? null,
  };
}

function sameWorkspace(
  number: { userId: string | null; organizationId: string | null },
  owner: NumberOwner,
): boolean {
  return owner.organizationId
    ? number.organizationId === owner.organizationId
    : number.organizationId === null && number.userId === owner.userId;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

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
    private readonly userService: UserService,
    private readonly numbers: NumberPurchasedRepository,
    private readonly redis: RedisService,
  ) {}

  /** Target ownership context for the account being administered. */
  private targetCtx(type: AccountType, id: string): OwnershipContext {
    return type === "org"
      ? { userId: "", organizationId: id }
      : { userId: id, organizationId: null };
  }

  async updateUserGeneralSettings(
    type: AccountType,
    id: string,
    input: UpdateUserGeneralSettingsInput,
  ): Promise<UserGeneralSettings> {
    if (type !== "user") {
      throw new BadRequestException(
        "General settings can only be configured for users",
      );
    }
    return this.userService.updateGeneralSettings(id, input);
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
    status: NumberInventoryStatus;
    search?: string;
    limit?: number;
  }): Promise<NumberListItem[]> {
    const limit = Math.min(Math.max(params.limit || 200, 1), 500);
    return this.repo.listNumbers({ ...params, limit });
  }

  /**
   * Register numbers in Ringee's inventory — Ringee's records only: nothing is
   * ordered, moved or configured at the carrier — and, when an account is
   * named, assign each one to it. Every number is handled on its own, so one
   * that cannot be registered never stops the rest.
   */
  async registerNumbers(input: {
    phoneNumbers: string[];
    assignTo: { type: AccountType; id: string } | null;
  }): Promise<{ results: NumberRegistrationResult[] }> {
    const entries = input.phoneNumbers.map((raw) => raw.trim()).filter(Boolean);
    if (entries.length === 0) {
      throw new BadRequestException("Enter at least one phone number");
    }
    if (entries.length > MAX_NUMBERS_PER_REGISTRATION) {
      throw new BadRequestException(
        `Register up to ${MAX_NUMBERS_PER_REGISTRATION} numbers at a time`,
      );
    }
    const owner = input.assignTo
      ? await this.resolveOwner(input.assignTo.type, input.assignTo.id)
      : null;

    const results: NumberRegistrationResult[] = [];
    const seen = new Set<string>();
    for (const raw of entries) {
      const registration = parseRegistrableNumber(raw);
      if (!registration) {
        results.push({
          phoneNumber: raw,
          outcome: "failed",
          numberId: null,
          assigned: false,
          error:
            "Not a valid phone number in international format (+ and country code)",
        });
        continue;
      }
      if (seen.has(registration.phoneNumber)) continue;
      seen.add(registration.phoneNumber);
      results.push(await this.registerOne(registration, owner));
    }
    return { results };
  }

  private async registerOne(
    registration: NumberRegistration,
    owner: NumberOwner | null,
  ): Promise<NumberRegistrationResult> {
    const { phoneNumber } = registration;
    const failed = (error: string): NumberRegistrationResult => ({
      phoneNumber,
      outcome: "failed",
      numberId: null,
      assigned: false,
      error,
    });

    const existing = await this.numbers.findByPhoneNumber(phoneNumber);
    if (existing && existing.kind !== "purchased") {
      return failed("A customer verified this number as their own caller ID");
    }

    let numberId: string;
    let outcome: Exclude<NumberRegistrationOutcome, "failed">;
    if (existing && !existing.deletedAt) {
      const assigned = !!(existing.userId || existing.organizationId);
      const result: NumberRegistrationResult = {
        phoneNumber,
        outcome: "existing",
        numberId: existing.id,
        assigned: !!owner && assigned && sameWorkspace(existing, owner),
        error: null,
      };
      if (!owner || result.assigned) return result;
      if (assigned) {
        return {
          ...result,
          error: "Already assigned to another account — unassign it first",
        };
      }
      numberId = existing.id;
      outcome = "existing";
    } else {
      try {
        const number = await this.repo.adminRegister(
          registration,
          existing?.id ?? null,
        );
        numberId = number.id;
        outcome = existing ? "restored" : "added";
      } catch (err) {
        if (err instanceof ConflictException || isUniqueViolation(err)) {
          return failed("Someone added this number meanwhile");
        }
        throw err;
      }
    }

    if (!owner) {
      return { phoneNumber, outcome, numberId, assigned: false, error: null };
    }
    try {
      await this.withNumberLock(numberId, () =>
        this.repo.adminAssign(numberId, owner),
      );
      return { phoneNumber, outcome, numberId, assigned: true, error: null };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        phoneNumber,
        outcome,
        numberId,
        assigned: false,
        error: `In Ringee, but not assigned: ${reason}`,
      };
    }
  }

  async assignNumber(
    type: AccountType,
    id: string,
    numberId: string,
  ): Promise<NumberPurchased> {
    const owner = await this.resolveOwner(type, id);
    return this.withNumberLock(numberId, () =>
      this.repo.adminAssign(numberId, owner),
    );
  }

  unassignNumber(numberId: string): Promise<NumberPurchased> {
    return this.withNumberLock(numberId, () =>
      this.repo.adminUnassign(numberId),
    );
  }

  /** The user, or a member of the organization (an admin when there is one). */
  private async resolveOwner(
    type: AccountType,
    id: string,
  ): Promise<NumberOwner> {
    if (type === "org") {
      const ownerUserId = await this.repo.resolveOrgOwnerUserId(id);
      if (!ownerUserId) {
        throw new BadRequestException(
          "Organization has no members to own the number",
        );
      }
      return { userId: ownerUserId, organizationId: id };
    }
    if (!(await this.repo.userExists(id))) {
      throw new NotFoundException("User not found");
    }
    return { userId: id, organizationId: null };
  }

  /**
   * Assigning and unassigning move a number between workspaces, so they hold
   * the lock every inbound-route writer holds (NUM-009): a route save that
   * checked the number's workspace cannot land after the number has left it.
   */
  private async withNumberLock<T>(
    numberId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const lock = inboundRouteLockKey({ kind: "ringee", id: numberId });
    const token = randomUUID();
    if (!(await this.redis.setIfAbsent(lock, token, 120))) {
      throw new ConflictException(
        "This number's routing is being updated. Try again.",
      );
    }
    try {
      return await work();
    } finally {
      await this.redis.compareAndSwap(lock, token, null);
    }
  }
}
