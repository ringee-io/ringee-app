import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "@ringee/database";
import { ApiModule } from "./api/api.module";
import { ServicesModule } from "@ringee/services";
import { McpModule } from "./mcp/mcp.module";
import { RedisModule } from "@ringee/platform";
import { APP_GUARD } from "@nestjs/core";
import { ClerkAuthGuard } from "./clerk.auth.guard";

@Module({
  imports: [DatabaseModule, ApiModule, ServicesModule, McpModule, RedisModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
})
export class AppModule { }
