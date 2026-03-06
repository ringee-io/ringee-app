import {
  Body,
  Controller,
  HttpException,
  Param,
  Post,
  Sse,
} from "@nestjs/common";
import { UserService } from "@ringee/services";
import { McpService } from "../../mcp/mcp.service";

@Controller("/mcp")
export class McpController {
  constructor(
    private _mcpService: McpService,
    private _userService: UserService,
  ) { }

  @Sse("/:api/sse")
  async sse(@Param("api") api: string) {
    const apiModel = await this._userService.getUserById(api);
    if (!apiModel) {
      throw new HttpException("Invalid url", 400);
    }

    return await this._mcpService.runServer(api, apiModel.id);
  }

  @Post("/:api/messages")
  async post(@Param("api") api: string, @Body() body: any) {
    const apiModel = await this._userService.getUserById(api);
    if (!apiModel) {
      throw new HttpException("Invalid url", 400);
    }

    return this._mcpService.processPostBody(apiModel.id, body);
  }
}
