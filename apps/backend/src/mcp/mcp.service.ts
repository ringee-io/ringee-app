import { Injectable } from "@nestjs/common";
import EventEmitter from "events";
import { finalize, fromEvent, startWith } from "rxjs";
import { McpSettings } from "./mcp.settings";
import { McpTransport } from "./mcp.transport";
import { apiConfiguration } from "@ringee/configuration";
import { McpFunc } from "./mcp.func";
import { JSONRPCMessageSchema } from "./mcp.types";

@Injectable()
export class McpService {
  static event = new EventEmitter();
  constructor(private _mainMcp: McpFunc) {}

  async runServer(apiKey: string, user: string) {
    const server = McpSettings.load(user, this._mainMcp).server();
    const transport = new McpTransport(user);

    const observer = fromEvent(McpService.event, `user-${user}`).pipe(
      startWith({
        type: "endpoint",
        data:
          apiConfiguration.PUBLIC_BACKEND_URL + "/mcp/" + apiKey + "/messages",
      }),
      finalize(() => {
        transport.close();
      }),
    );

    await server.connect(transport);

    return observer;
  }

  async processPostBody(user: string, body: object) {
    const server = McpSettings.load(user, this._mainMcp).server();
    const message = JSONRPCMessageSchema.parse(body);
    const transport = new McpTransport(user);

    await server.connect(transport);
    transport.handlePostMessage(message);

    return {};
  }
}
