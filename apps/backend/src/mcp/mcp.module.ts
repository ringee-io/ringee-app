import { Module } from "@nestjs/common";
import { McpFunc } from "./mcp.func";
import { McpService } from "./mcp.service";
import { McpToolsRepository } from "./mcp.tools.repository";

@Module({
  providers: [McpFunc, McpService, McpToolsRepository],
  exports: [McpService, McpFunc, McpToolsRepository],
})
export class McpModule {}
