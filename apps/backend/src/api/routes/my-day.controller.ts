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
  resolveMemberFilter,
} from "@ringee/platform";
import { MyDayService } from "@ringee/services";
import { parseOptionalIsoDate } from "../query-dates";

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
      parseOptionalIsoDate(until, "until"),
    );
  }

  /** How the caller's day is going, between the bounds of their local day. */
  @Get("summary")
  async summary(
    @CurrentUser() user: CurrentUserData,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const start = parseOptionalIsoDate(from, "from");
    const end = parseOptionalIsoDate(to, "to");
    if (!start !== !end) {
      throw new BadRequestException("from and to go together");
    }
    return this.myDay.getSummary(
      createOwnershipContext(user),
      start && end ? { from: start, to: end } : undefined,
    );
  }

  /**
   * Who a contact is before the call: role, company, where to look them up,
   * and the last calls with them. Inside an organization a member sees only
   * their own calls (`resolveMemberFilter`); an admin sees the team's.
   */
  @Get("contacts/:contactId")
  async contactBrief(
    @CurrentUser() user: CurrentUserData,
    @Param("contactId", ParseUUIDPipe) contactId: string,
  ) {
    return this.myDay.getContactBrief(
      createOwnershipContext(user),
      contactId,
      resolveMemberFilter(user),
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
