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
}

function parseAccountType(type: string): AccountType {
  if (type !== "user" && type !== "org") {
    throw new BadRequestException("type must be 'user' or 'org'");
  }
  return type;
}

/** Default dashboard window when no range is supplied: last 30 days. */
function parseRange(q: { start?: string; end?: string }): {
  start: Date;
  end: Date;
} {
  const end = q.end ? new Date(q.end) : new Date();
  const start = q.start
    ? new Date(q.start)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
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
  constructor(private readonly backoffice: BackofficeService) {}

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
  getAccount(@Param("type") type: string, @Param("id") id: string) {
    return this.backoffice.getAccount(parseAccountType(type), id);
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
