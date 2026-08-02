import { Module } from "@nestjs/common";
import { SdkAuthController } from "./sdk-auth.controller";
import { SdkSessionController } from "./sdk-session.controller";
import { SdkCallController } from "./sdk-call.controller";
import { SdkSessionGuard } from "./sdk-session.guard";

/**
 * Ringee Dialer SDK backend surface (`/api/v1/sdk/*`). All domain logic lives
 * in `@ringee/services` (global module); this module just exposes the
 * controllers + the session guard. Dynamic CORS for these routes is wired in
 * `main.ts` (`sdkCors`) ahead of the global CORS.
 */
@Module({
  controllers: [SdkAuthController, SdkSessionController, SdkCallController],
  providers: [SdkSessionGuard],
})
export class SdkModule {}
