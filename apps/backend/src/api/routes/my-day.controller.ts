import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
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

  /** The lists assigned to the caller, to work from the Call page. */
  @Get("lists")
  async lists(@CurrentUser() user: CurrentUserData) {
    return this.myDay.getLists(createOwnershipContext(user));
  }

  /** Who to call next from one of those lists. */
  @Get("lists/:listId/next")
  async listNext(
    @CurrentUser() user: CurrentUserData,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.myDay.getListNext(createOwnershipContext(user), listId);
  }

  /** Sends a contact to the back of the list; answers with who comes next. */
  @Post("lists/:listId/entries/:entryId/skip")
  @HttpCode(HttpStatus.OK)
  async skipListEntry(
    @CurrentUser() user: CurrentUserData,
    @Param("listId", ParseUUIDPipe) listId: string,
    @Param("entryId", ParseUUIDPipe) entryId: string,
  ) {
    return this.myDay.skipListEntry(
      createOwnershipContext(user),
      listId,
      entryId,
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
