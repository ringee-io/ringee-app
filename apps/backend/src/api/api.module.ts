import { Module } from "@nestjs/common";
import { RoutesModule } from "./routes/routes.module";
import { SdkModule } from "./sdk/sdk.module";

@Module({
  imports: [RoutesModule, SdkModule],
})
export class ApiModule {}
