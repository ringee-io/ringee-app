import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { BackofficeService, PipelineType } from "@ringee/services";
import { AccountType } from "@ringee/database";
import { SuperAdminOnly } from "../guards/super-admin.guard";
import type { RealtimeDevice } from "@ringee/platform";
import {
  EnforcementResult,
  UserAccessAdminState,
  UserAccessEnforcementResponse,
  UserAccessEnforcementService,
} from "./user-access-enforcement.service";

const PIPELINE_TYPES: PipelineType[] = [
  "follow_up_recommendations",
  "script_optimization",
  "objection_intelligence",
];

class SetCreditDto {
  @IsIn(["set", "adjust"])
  mode!: "set" | "adjust";

  @IsNumber()
  amount!: number;
}

class UpdateRecordingSettingsDto {
  @IsOptional()
  @IsBoolean()
  recordAllCalls?: boolean;

  @IsOptional()
  @IsBoolean()
  transcribeRealtime?: boolean;

  @IsOptional()
  @IsBoolean()
  transcribeRecordings?: boolean;
}

class SetAiPipelineDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsIn(PIPELINE_TYPES)
  pipelineType?: PipelineType;
}

class AssignNumberDto {
  @IsString()
  numberId!: string;
}

class TerminateCallsDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class UpdateUserGeneralSettingsDto {
  @IsOptional()
  @IsBoolean()
  canCall?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2000)
  minimumCreditPurchase?: number;

  @IsOptional()
  @IsBoolean()
  freeCallTrial?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  numberPurchaseLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  phoneRequired?: boolean;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseAccountType(type: string): AccountType {
  if (type !== "user" && type !== "org") {
    throw new BadRequestException("type must be 'user' or 'org'");
  }
  return type;
}

/** Default dashboard window when no range is supplied: today so far. */
function parseRange(q: { start?: string; end?: string }): {
  start: Date;
  end: Date;
} {
  const end = q.end ? new Date(q.end) : new Date();
  const start = q.start ? new Date(q.start) : startOfDay(end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException("Invalid start/end date");
  }
  return { start, end };
}

/**
 * Internal super-admin (backoffice) area. Every route is gated by the email
 * allowlist via @SuperAdminOnly() — this controller is the real access boundary;
 * the frontend gate is UX only.
 */
@Controller("backoffice")
@SuperAdminOnly()
export class BackofficeController {
  constructor(
    private readonly backoffice: BackofficeService,
    private readonly userAccess: UserAccessEnforcementService,
  ) {}

  @Get("dashboard")
  getDashboard(@Query() q: { start?: string; end?: string }) {
    const { start, end } = parseRange(q);
    return this.backoffice.getDashboard(start, end);
  }

  @Get("accounts")
  listAccounts(
    @Query()
    q: {
      type?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const type = q.type === "org" ? "org" : "user";
    return this.backoffice.listAccounts({
      type,
      search: q.search,
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 25,
    });
  }

  @Get("numbers")
  listNumbers(@Query() q: { status?: string; search?: string }) {
    const status =
      q.status === "assigned"
        ? "assigned"
        : q.status === "all"
          ? "all"
          : "available";
    return this.backoffice.listNumbers({ status, search: q.search });
  }

  @Get("accounts/:type/:id")
  async getAccount(@Param("type") type: string, @Param("id") id: string) {
    const accountType = parseAccountType(type);
    const account = await this.backoffice.getAccount(accountType, id);
    if (accountType !== "user" || !account.userSettings) {
      return account;
    }
    return {
      ...account,
      userSettings: {
        ...account.userSettings,
        access: await this.userAccess.getAdminState(id),
      },
    };
  }

  @Post("accounts/user/:id/access/stripe-abuse/restore")
  restoreStripeAbuse(@Param("id") id: string): Promise<UserAccessAdminState> {
    return this.userAccess.restoreStripeAbuse(id);
  }

  @Post("accounts/user/:id/access/ringee-block/remove")
  removeRingeeBlock(@Param("id") id: string): Promise<UserAccessAdminState> {
    return this.userAccess.removeRingeeBlock(id);
  }

  /**
   * Full lockdown: bans the Clerk identity, blocks the Ringee account, hangs up
   * every live call at the provider and pushes `account.blocked` to every
   * signed-in device over its WebSocket.
   */
  @Post("accounts/user/:id/access/clerk/ban")
  banInClerk(@Param("id") id: string): Promise<UserAccessEnforcementResponse> {
    return this.userAccess.setClerkBan(id, true);
  }

  @Post("accounts/user/:id/access/clerk/unban")
  unbanInClerk(
    @Param("id") id: string,
  ): Promise<UserAccessEnforcementResponse> {
    return this.userAccess.setClerkBan(id, false);
  }

  /** Devices holding an open realtime socket right now, across all instances. */
  @Get("accounts/user/:id/access/devices")
  listConnectedDevices(@Param("id") id: string): Promise<RealtimeDevice[]> {
    return this.userAccess.listConnectedDevices(id);
  }

  /** Drop the user's live calls without changing their account access. */
  @Post("accounts/user/:id/access/terminate-calls")
  terminateActiveCalls(
    @Param("id") id: string,
    @Body() dto: TerminateCallsDto,
  ): Promise<EnforcementResult> {
    return this.userAccess.terminateActiveCalls(id, dto.reason);
  }

  @Post("accounts/:type/:id/credit")
  setCredit(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() dto: SetCreditDto,
  ) {
    return this.backoffice.setCredit(parseAccountType(type), id, dto);
  }

  @Patch("accounts/:type/:id/general-settings")
  updateUserGeneralSettings(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() dto: UpdateUserGeneralSettingsDto,
  ) {
    return this.backoffice.updateUserGeneralSettings(
      parseAccountType(type),
      id,
      dto,
    );
  }

  @Put("accounts/:type/:id/recording-settings")
  updateRecordingSettings(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() dto: UpdateRecordingSettingsDto,
  ) {
    return this.backoffice.updateRecordingSettings(
      parseAccountType(type),
      id,
      dto,
    );
  }

  @Put("accounts/:type/:id/ai-pipeline")
  setAiPipeline(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() dto: SetAiPipelineDto,
  ) {
    return this.backoffice.setAiPipeline(
      parseAccountType(type),
      id,
      dto.enabled,
      dto.pipelineType,
    );
  }

  @Post("accounts/:type/:id/numbers")
  assignNumber(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body() dto: AssignNumberDto,
  ) {
    return this.backoffice.assignNumber(
      parseAccountType(type),
      id,
      dto.numberId,
    );
  }

  @Delete("accounts/:type/:id/numbers/:numberId")
  unassignNumber(@Param("numberId") numberId: string) {
    return this.backoffice.unassignNumber(numberId);
  }
}
