import { Controller, Get } from "@nestjs/common";
import {
  createOwnershipContext,
  CurrentUser,
  type CurrentUserData,
} from "@ringee/platform";
import { ProductAnalyticsService } from "@ringee/services";

/**
 * The analytics identity the dashboard reports with (Stage 4B): the same
 * internal user id the backend facts carry, and the effective workspace as the
 * `workspace` group — derived from the authenticated context, never from an id
 * the browser sends. Holds no secret: the browser's project key is public
 * configuration, and nothing here authorizes anything.
 */
@Controller("analytics")
export class ProductAnalyticsController {
  constructor(private readonly analytics: ProductAnalyticsService) {}

  @Get("identity")
  identity(@CurrentUser() user: CurrentUserData) {
    return this.analytics.identity(createOwnershipContext(user));
  }
}
