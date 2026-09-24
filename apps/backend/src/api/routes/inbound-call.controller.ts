import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  GoneException,
  Param,
  Post,
  Get,
  Delete,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  createOwnershipContext,
  CurrentUser,
  CurrentUserData,
} from "@ringee/platform";
import { InboundRingService } from "@ringee/services";

/** Provider call ids are opaque; accept only what one can look like. */
const CALL_CONTROL_ID = /^[A-Za-z0-9_=+/-]{8,256}$/;

/**
 * Taking an inbound call that is being offered to more than one endpoint.
 *
 * This is the server-side half of "first to answer wins": a client claims the
 * call **before** it answers the media leg, and only one claim can succeed. A
 * member who was not rung cannot claim at all, so the election never depends
 * on what a browser decided to show.
 */
@Controller("inbound-calls")
export class InboundCallController {
  constructor(private readonly ring: InboundRingService) {}

  @Post("browser-endpoints")
  createBrowserEndpoint(@CurrentUser() user: CurrentUserData) {
    return this.ring.createBrowserEndpoint(createOwnershipContext(user));
  }

  @Post("browser-endpoints/:id/ready")
  ready(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ring.touchBrowserEndpoint(createOwnershipContext(user), id);
  }

  @Delete("browser-endpoints/:id")
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ring.touchBrowserEndpoint(
      createOwnershipContext(user),
      id,
      true,
    );
  }

  @Get("legs/:callControlId")
  leg(
    @CurrentUser() user: CurrentUserData,
    @Param("callControlId") id: string,
  ) {
    if (!CALL_CONTROL_ID.test(id))
      throw new BadRequestException("Unknown call.");
    return this.ring.browserLeg(createOwnershipContext(user), id);
  }

  @Post(":callControlId/claim")
  async claim(
    @CurrentUser() user: CurrentUserData,
    @Param("callControlId") callControlId: string,
  ) {
    if (!CALL_CONTROL_ID.test(callControlId))
      throw new BadRequestException("Unknown call.");

    const claim = await this.ring.claim(callControlId, user.id);
    switch (claim.status) {
      case "won":
        return { claimed: true, callId: claim.call.id };
      case "lost":
        throw new ConflictException("This call was already answered.");
      case "not_a_target":
        throw new ForbiddenException("This call was not offered to you.");
      case "gone":
        throw new GoneException("This call is no longer ringing.");
    }
  }
}
