import { Module } from "@nestjs/common";
import { McpFunc } from "./mcp.func";
import { McpService } from "./mcp.service";
import { ChatModule } from "@ringee/platform";
import { McpToolsRepository } from "./mcp.tools.repository";

@Module({
  imports: [ChatModule],
  providers: [McpFunc, McpService, McpToolsRepository],
  exports: [McpService, McpFunc, McpToolsRepository],
})
export class McpModule {}
