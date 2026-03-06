import { Injectable } from "@nestjs/common";
import { McpTool } from "./mcp.tools";
import {
  ChatSignUpDto,
  ChatWelcomeDto,
  ChatWelcomeNotLoggedInDto,
  ShowMenuDto,
  WhatsappService,
} from "@ringee/platform";
import {
  ShowMenuSchema,
  SignInSchema,
  SignUpSchema,
  WelcomeNotLoggedInSchema,
  WelcomeSchema,
} from "./mcp.zod";

@Injectable()
export class McpFunc {
  constructor(private readonly whatsappService: WhatsappService) {}

  @McpTool({ toolName: "welcome", zod: WelcomeSchema as any })
  async welcome(phoneNumber: string, dto: ChatWelcomeDto) {
    await this.whatsappService.welcome(phoneNumber, dto);

    return [{ type: "text", text: "Welcome sent" }];
  }

  @McpTool({ toolName: "showMenu", zod: ShowMenuSchema as any })
  async showMenu(phoneNumber: string, dto: ShowMenuDto) {
    await this.whatsappService.showMenu(phoneNumber, dto);

    return [{ type: "text", text: "Menu shown" }];
  }

  @McpTool({ toolName: "SignIn", zod: SignInSchema as any })
  async signIn(phoneNumber: string, dto: any) {
    await this.whatsappService.signIn(phoneNumber, dto);

    return [{ type: "text", text: "SignIn link and message sent" }];
  }

  @McpTool({ toolName: "SignUp", zod: SignUpSchema as any })
  async signUp(phoneNumber: string, dto: ChatSignUpDto) {
    await this.whatsappService.signUp(phoneNumber, dto);

    return [{ type: "text", text: "SignUp link and message sent" }];
  }

  @McpTool({
    toolName: "welcomeNotLoggedIn",
    zod: WelcomeNotLoggedInSchema as any,
  })
  async welcomeNotLoggedIn(
    phoneNumber: string,
    dto: ChatWelcomeNotLoggedInDto,
  ) {
    await this.whatsappService.welcomeNotLoggedIn(phoneNumber, dto);

    return [{ type: "text", text: "Welcome not logged in sent" }];
  }
}
