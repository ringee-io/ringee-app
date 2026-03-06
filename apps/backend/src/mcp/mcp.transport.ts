import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpService } from "./mcp.service";
import { JSONRPCMessageSchema, type JSONRPCMessage } from "./mcp.types";

export class McpTransport implements Transport {
  constructor(private _userId: string) {}

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start() {}

  async send(message: JSONRPCMessage): Promise<void> {
    McpService.event.emit(`user-${this._userId}`, {
      type: "message",
      data: JSON.stringify(message),
    });
  }

  async close() {
    McpService.event.removeAllListeners(`user-${this._userId}`);
  }

  handlePostMessage(message: any) {
    let parsedMessage: JSONRPCMessage;

    try {
      parsedMessage = JSONRPCMessageSchema.parse(message);
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }

    this.onmessage?.(parsedMessage);
  }

  get sessionId() {
    return this._userId;
  }
}
