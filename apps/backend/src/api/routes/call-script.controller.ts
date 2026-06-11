import { Body, Controller, Get, Put } from "@nestjs/common";
import { CurrentUser, createOwnershipContext } from "@ringee/platform";
import { CallScriptService, ScriptSectionDto } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
}

type SaveScriptBody = {
  sections: ScriptSectionDto[];
};

@Controller("call-scripts")
export class CallScriptController {
  constructor(private readonly callScriptService: CallScriptService) {}

  @Get()
  async getScript(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.callScriptService.getScript(ctx);
  }

  @Put()
  async saveScript(
    @CurrentUser() user: CurrentUserData,
    @Body() body: SaveScriptBody,
  ) {
    const ctx = createOwnershipContext(user);
    return this.callScriptService.saveScript(ctx, body?.sections ?? []);
  }
}
