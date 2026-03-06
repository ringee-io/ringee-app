import {
  Controller,
  Patch,
  Body,
  BadRequestException,
  Get,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "@ringee/platform";
import { UserDeviceService, UserService } from "@ringee/services";
import { User } from "@ringee/database";

@Controller("user")
export class UserController {
  constructor(
    private readonly userDeviceService: UserDeviceService,
    private readonly userService: UserService,
  ) { }

  @Patch("fcm-token")
  async updateFcmToken(
    @CurrentUser() user: User,
    @Body() body: { fcmToken: string },
  ) {
    if (!body.fcmToken) {
      throw new BadRequestException("fcmToken is required");
    }

    await this.userDeviceService.registerDevice(user.id, body.fcmToken);
  }

  /**
   * Batch convert Clerk IDs to internal DB IDs
   * Used by frontend member-selector to get DB IDs for dashboard filtering
   */
  @Get("by-clerk-ids")
  async getUsersByClerkIds(@Query("ids") ids: string) {
    if (!ids) {
      throw new BadRequestException("ids query parameter is required");
    }

    const clerkIdArray = ids.split(",").map((id) => id.trim()).filter(Boolean);

    if (clerkIdArray.length === 0) {
      throw new BadRequestException("At least one id is required");
    }

    const users = await this.userService.getByClerkIds(clerkIdArray);

    // Return map of clerkId -> dbUserId
    return users.map((u) => ({
      clerkId: u.clerkId,
      id: u.id,
    }));
  }
}
