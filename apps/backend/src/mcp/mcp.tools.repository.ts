import "reflect-metadata";
import { Injectable, Logger } from "@nestjs/common";
import { McpFunc } from "./mcp.func";
import { ChatCompletionTool } from "@ringee/platform";

@Injectable()
export class McpToolsRepository {
  private readonly logger = new Logger(McpToolsRepository.name);

  constructor(private readonly mainMcp: McpFunc) {}

  getAllTools(): ChatCompletionTool[] {
    const metadata =
      Reflect.getMetadata("MCP_TOOL", this.mainMcp.constructor.prototype) || [];

    const tools: ChatCompletionTool[] = metadata.map((meta: any) => {
      const { toolName, zod, description } = meta.data;

      return {
        type: "function",
        function: {
          name: toolName,
          description: description || `Executes the ${toolName} WhatsApp flow.`,
          strict: true,
          parameters: zod,
        },
      };
    });

    this.logger.log(`Loaded ${tools.length} MCP tools`);
    return tools;
  }

  async exec(
    phoneNumber: string,
    toolName: string,
    ...args: any[]
  ): Promise<any> {
    const toolsMetadata =
      Reflect.getMetadata("MCP_TOOL", this.mainMcp.constructor.prototype) || [];

    const selectedTool = toolsMetadata.find(
      (meta: any) => meta.data.toolName === toolName,
    );

    if (!selectedTool) {
      this.logger.error(`Tool "${toolName}" not found.`);
      throw new Error(`Tool "${toolName}" not found.`);
    }

    const funcName = selectedTool.func as string;
    const fn = (this.mainMcp as any)[funcName];

    if (typeof fn !== "function") {
      throw new Error(`"${funcName}" is not a valid function`);
    }

    try {
      const result = await fn.call(this.mainMcp, phoneNumber, ...args);
      this.logger.log(`Tool "${toolName}" executed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error executing "${toolName}": ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
