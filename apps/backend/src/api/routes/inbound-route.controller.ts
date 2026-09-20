import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import { IsIn, IsUUID } from "class-validator";
import { InboundDestinationType } from "@ringee/database";
import {
  CurrentUser,
  CurrentUserData,
  OrgAdminOnly,
  createOwnershipContext,
} from "@ringee/platform";
import { InboundRouteService } from "@ringee/services";
import type { InboundNumberRef } from "@ringee/services";

/** Which number model the path refers to. */
const NUMBER_KINDS = ["ringee", "external"] as const;
type NumberKind = (typeof NUMBER_KINDS)[number];

class InboundRouteDto {
  @IsIn(Object.values(InboundDestinationType))
  destinationType!: InboundDestinationType;

  /** The user, ring group or desk phone the calls go to. */
  @IsUUID() destinationId!: string;
}

/**
 * Where a number's inbound calls go. Writing a route is workspace
 * configuration, so it is admin-only inside an organization; a freelancer is
 * unrestricted, as everywhere else.
 *
 * Numbers live in two models — Ringee's own DIDs and a customer carrier's —
 * so the kind is part of the path rather than guessed from the id.
 */
@OrgAdminOnly()
@Controller("inbound-routes")
export class InboundRouteController {
  constructor(private readonly service: InboundRouteService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.service.list(createOwnershipContext(user));
  }

  @Get(":numberKind/:numberId")
  get(
    @CurrentUser() user: CurrentUserData,
    @Param("numberKind") numberKind: NumberKind,
    @Param("numberId", ParseUUIDPipe) numberId: string,
  ) {
    return this.service.getForNumber(
      createOwnershipContext(user),
      ref(numberKind, numberId),
    );
  }

  /** Create or replace the route. One number, one destination. */
  @Put(":numberKind/:numberId")
  save(
    @CurrentUser() user: CurrentUserData,
    @Param("numberKind") numberKind: NumberKind,
    @Param("numberId", ParseUUIDPipe) numberId: string,
    @Body() body: InboundRouteDto,
  ) {
    return this.service.saveForNumber(
      createOwnershipContext(user),
      ref(numberKind, numberId),
      body,
    );
  }

  /** Reset the number to its default inbound behavior. */
  @Delete(":numberKind/:numberId")
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param("numberKind") numberKind: NumberKind,
    @Param("numberId", ParseUUIDPipe) numberId: string,
  ) {
    return this.service.deleteForNumber(
      createOwnershipContext(user),
      ref(numberKind, numberId),
    );
  }
}

function ref(numberKind: string, id: string): InboundNumberRef {
  return {
    kind: NUMBER_KINDS.includes(numberKind as NumberKind)
      ? (numberKind as NumberKind)
      : "ringee",
    id,
  };
}
