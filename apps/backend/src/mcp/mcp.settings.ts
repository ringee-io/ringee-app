import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAiSystemPrompt } from "@ringee/platform";

class MainMcp {}

export class McpSettings {
  private _server!: McpServer;

  createServer(userId: string, service: MainMcp) {
    this._server = new McpServer(
      {
        name: "Ringee",
        version: "2.0.0",
      },
      {
        instructions: getAiSystemPrompt(),
      },
    );

    for (const usePrompt of Reflect.getMetadata(
      "MCP_PROMPT",
      MainMcp.prototype,
    ) || []) {
      const list = [
        usePrompt.data.promptName,
        usePrompt.data.zod,
        async (...args: any[]) => {
          return {
            // @ts-ignore
            messages: await service[usePrompt.func as string](userId, ...args),
          };
        },
      ].filter((f) => f);
      this._server.prompt(...(list as [any, any, any]));
    }

    for (const usePrompt of Reflect.getMetadata(
      "MCP_TOOL",
      MainMcp.prototype,
    ) || []) {
      const list: any[] = [
        usePrompt.data.toolName,
        usePrompt.data.zod,
        async (...args: any[]) => {
          return {
            // @ts-ignore
            content: await service[usePrompt.func as string](userId, ...args),
          };
        },
      ].filter((f) => f);

      this._server.tool(...(list as [any, any, any]));
    }

    return this;
  }

  server() {
    return this._server;
  }

  static load(userId: string, service: MainMcp): McpSettings {
    return new McpSettings().createServer(userId, service);
  }
}
