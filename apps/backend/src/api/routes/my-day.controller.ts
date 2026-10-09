import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserData,
  createOwnershipContext,
} from "@ringee/platform";
import { MyDayService } from "@ringee/services";

/** "My day" on the Call page, for the signed-in user's own workspace. */
@Controller("my-day")
export class MyDayController {
  constructor(private readonly myDay: MyDayService) {}

  /**
   * Today's calls, in order. `until` is the end of the caller's local day
   * (ISO 8601): the browser knows the time zone, the server does not.
   */
  @Get("queue")
  async queue(
    @CurrentUser() user: CurrentUserData,
    @Query("until") until?: string,
  ) {
    return this.myDay.getQueue(
      createOwnershipContext(user),
      parseOptionalDate(until, "until"),
    );
  }

  /** How the caller's day is going, between the bounds of their local day. */
  @Get("summary")
  async summary(
    @CurrentUser() user: CurrentUserData,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const start = parseOptionalDate(from, "from");
    const end = parseOptionalDate(to, "to");
    if (!start !== !end) {
      throw new BadRequestException("from and to go together");
    }
    return this.myDay.getSummary(
      createOwnershipContext(user),
      start && end ? { from: start, to: end } : undefined,
    );
  }
}

function parseOptionalDate(value: string | undefined, name: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${name} must be an ISO 8601 date`);
  }
  return date;
}
