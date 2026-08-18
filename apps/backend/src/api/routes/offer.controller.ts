import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { IsIn, IsObject, IsOptional } from "class-validator";
import { CurrentUser, CurrentUserData } from "@ringee/platform";
import { OfferService } from "@ringee/services";
import { OfferPlacement } from "@ringee/database";

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

/**
 * The client may only send what the action asks for. Reward amounts, ownership,
 * eligibility and totals are never accepted from the wire — the backend derives
 * all of them.
 */
class SubmitOfferDto {
  @IsOptional()
  @IsObject()
  submissionData?: Record<string, unknown>;
}

class TrackOfferDto {
  @IsIn(["impression", "clicked"])
  event!: "impression" | "clicked";
}

@Controller("offers")
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  /**
   * Offers the caller can see right now, best first. Polled by every placement
   * surface, so it is deliberately a fixed-cost call: one cached context plus a
   * handful of batched reads, regardless of how many offers exist.
   */
  @Get("available")
  async available(
    @CurrentUser() user: CurrentUserData,
    @Query("placement") placement?: string,
    @Query("limit") limit?: string,
  ) {
    const offers = await this.offerService.listAvailable(user, {
      placement: this.parsePlacement(placement),
      limit: limit ? Math.min(Math.max(Number(limit) || 1, 1), 20) : undefined,
    });
    return { offers };
  }

  @Get(":idOrSlug")
  async get(
    @CurrentUser() user: CurrentUserData,
    @Param("idOrSlug") idOrSlug: string,
  ) {
    return this.offerService.getForUser(user, idOrSlug);
  }

  /** Opens a claim before a multi-step action; safe to call more than once. */
  @Post(":idOrSlug/start")
  async start(
    @CurrentUser() user: CurrentUserData,
    @Param("idOrSlug") idOrSlug: string,
  ) {
    return this.offerService.start(user, idOrSlug);
  }

  @Post(":idOrSlug/submit")
  async submit(
    @CurrentUser() user: CurrentUserData,
    @Param("idOrSlug") idOrSlug: string,
    @Body() body: SubmitOfferDto,
  ) {
    return this.offerService.submit(user, idOrSlug, body.submissionData);
  }

  /** "Not now" — hides the offer for a while. Never a claim. */
  @Post(":idOrSlug/dismiss")
  async dismiss(
    @CurrentUser() user: CurrentUserData,
    @Param("idOrSlug") idOrSlug: string,
  ) {
    await this.offerService.dismiss(user, idOrSlug);
    return { dismissed: true };
  }

  /** Funnel events only the client can witness (rendered, clicked). */
  @Post(":idOrSlug/track")
  async track(
    @CurrentUser() user: CurrentUserData,
    @Param("idOrSlug") idOrSlug: string,
    @Body() body: TrackOfferDto,
  ) {
    await this.offerService.track(user, idOrSlug, body.event);
    return { tracked: true };
  }

  private parsePlacement(value?: string): OfferPlacement | undefined {
    if (!value) return undefined;
    const placement = value.toUpperCase() as OfferPlacement;
    if (!PLACEMENTS.includes(placement)) {
      throw new BadRequestException(`Unknown placement "${value}".`);
    }
    return placement;
  }
}
