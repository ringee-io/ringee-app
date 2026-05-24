import "reflect-metadata";
import { Injectable, Logger } from "@nestjs/common";
import { OwnershipContext } from "@ringee/platform";
import { McpFunc } from "./mcp.func";
import {
  MCP_TOOL_METADATA,
  McpToolEntry,
  McpToolMeta,
} from "./mcp.tools";

@Injectable()
export class McpToolsRepository {
  private readonly logger = new Logger(McpToolsRepository.name);

  constructor(private readonly mainMcp: McpFunc) {}

  /**
   * All registered MCP tools metadata. Used by McpSettings to wire them
   * into the McpServer instance per session.
   */
  getAllTools(): McpToolMeta[] {
    return this.getEntries().map((entry) => entry.data);
  }

  getEntries(): McpToolEntry[] {
    return (
      (Reflect.getMetadata(
        MCP_TOOL_METADATA,
        this.mainMcp.constructor.prototype,
      ) as McpToolEntry[] | undefined) ?? []
    );
  }

  async exec(
    ctx: OwnershipContext,
    toolName: string,
    input: unknown,
  ): Promise<unknown> {
    const entry = this.getEntries().find(
      (meta) => meta.data.toolName === toolName,
    );

    if (!entry) {
      this.logger.error(`Tool "${toolName}" not found.`);
      throw new Error(`Tool "${toolName}" not found.`);
    }

    const fnName = entry.func as string;
    const fn = (this.mainMcp as unknown as Record<string, unknown>)[fnName];

    if (typeof fn !== "function") {
      throw new Error(`"${fnName}" is not a callable tool handler`);
    }

    try {
      const result = await (fn as Function).call(this.mainMcp, ctx, input);
      this.logger.log(`Tool "${toolName}" executed (user=${ctx.userId})`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error executing "${toolName}": ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
