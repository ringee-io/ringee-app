import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { CurrentUser, CurrentUserData } from "@ringee/platform";
import { OfferAdminService, OfferWriteInput } from "@ringee/services";
import {
  OfferAudienceType,
  OfferParticipationStatus,
  OfferPlacement,
  OfferStatus,
} from "@ringee/database";
import { SuperAdminOnly } from "../guards/super-admin.guard";

const STATUSES: OfferStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "ARCHIVED",
];

const PLACEMENTS: OfferPlacement[] = [
  "TOP_BANNER",
  "DASHBOARD_CARD",
  "MODAL",
  "SIDEBAR",
  "SETTINGS",
  "CHECKOUT",
  "CAMPAIGN_PAGE",
  "INBOX",
];

const AUDIENCES: OfferAudienceType[] = ["PERSONAL", "ORGANIZATION", "BOTH"];

const PARTICIPATION_STATUSES: OfferParticipationStatus[] = [
  "ELIGIBLE",
  "STARTED",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "REWARDED",
];

/**
 * Config payload for authoring an offer. The four JSON blocks are accepted as
 * opaque objects on purpose — that is what lets a new promotion ship without a
 * schema change or a deploy.
 */
class OfferConfigDto {
  @IsOptional()
  @IsObject()
  eligibilityConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  rewardConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  displayConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  frequencyConfig?: Record<string, unknown>;
}

class CreateOfferDto extends OfferConfigDto {
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase kebab-case",
  })
  slug!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  internalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: OfferStatus;

  @IsOptional()
  @IsIn(PLACEMENTS)
  placement?: OfferPlacement;

  @IsOptional()
  @IsIn(AUDIENCES)
  audienceType?: OfferAudienceType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxClaims?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxClaimsPerUser?: number;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

class UpdateOfferDto extends CreateOfferDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase kebab-case",
  })
  declare slug: string;

  @IsOptional()
  @IsString()
  declare name: string;

  @IsOptional()
  @IsString()
  declare title: string;
}

class RejectParticipationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Backoffice administration for offers. Guarded by the super-admin email
 * allowlist via @SuperAdminOnly() — this controller is the real access
 * boundary; the frontend gate is UX only.
 */
@Controller("backoffice/offers")
@SuperAdminOnly()
export class BackofficeOffersController {
  constructor(private readonly offers: OfferAdminService) {}

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("placement") placement?: string,
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25",
  ) {
    return this.offers.list({
      status: this.parseEnum(status, STATUSES, "status"),
      placement: this.parseEnum(placement, PLACEMENTS, "placement"),
      search: search?.trim() || undefined,
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 25, 100),
    });
  }

  @Post()
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CreateOfferDto,
  ) {
    return this.offers.create(
      this.toWriteInput(body) as OfferWriteInput,
      user.id,
    );
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.offers.get(id);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateOfferDto) {
    return this.offers.update(id, this.toWriteInput(body));
  }

  /**
   * Removes an offer permanently. Refused (409) once anyone has participated —
   * archive it instead, so the reward history survives.
   */
  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.offers.remove(id);
  }

  @Get(":id/participations")
  async participations(
    @Param("id") id: string,
    @Query("status") status?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25",
  ) {
    return this.offers.listParticipations({
      offerId: id,
      status: this.parseEnum(status, PARTICIPATION_STATUSES, "status"),
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 25, 100),
    });
  }

  /**
   * Approve and pay out. Idempotent end to end: the state transition is
   * conditional and the credit grant is ledger-keyed, so a double click issues
   * one reward.
   */
  @Post("participations/:participationId/approve")
  async approve(
    @CurrentUser() user: CurrentUserData,
    @Param("participationId") participationId: string,
  ) {
    return this.offers.approve(participationId, user.id);
  }

  @Post("participations/:participationId/reject")
  async reject(
    @CurrentUser() user: CurrentUserData,
    @Param("participationId") participationId: string,
    @Body() body: RejectParticipationDto,
  ) {
    return this.offers.reject(
      participationId,
      user.id,
      body.reason?.trim() || null,
    );
  }

  private toWriteInput(body: CreateOfferDto): Partial<OfferWriteInput> {
    return {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    };
  }

  private parseEnum<T extends string>(
    value: string | undefined,
    allowed: T[],
    field: string,
  ): T | undefined {
    if (!value || value === "all") return undefined;
    const upper = value.toUpperCase() as T;
    if (!allowed.includes(upper)) {
      throw new BadRequestException(`Unknown ${field} "${value}".`);
    }
    return upper;
  }
}
