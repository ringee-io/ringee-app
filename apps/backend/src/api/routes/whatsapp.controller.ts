import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  HttpStatus,
  Body,
} from "@nestjs/common";
import { Response } from "express";
import {
  WhatsappService,
  buildSystemPrompt,
  WhatsappEmoji,
  Public,
  OpenaiService,
  CryptoService,
  RedisService,
  OwnershipContext,
} from "@ringee/platform";
import { McpToolsRepository } from "../../mcp/mcp.tools.repository";
import { apiConfiguration } from "@ringee/configuration";
import { ChatAuthService, UserService } from "@ringee/services";

const minutes30ms = 60 * 30 * 1000;
const hours24ms = 60 * 60 * 24 * 1000;

@Public()
@Controller("whatsapp")
export class WhatsappController {
  constructor(
    private readonly redisService: RedisService,
    private readonly mcpToolsRepository: McpToolsRepository,
    private readonly whatsappService: WhatsappService,
    private readonly aiService: OpenaiService,
    private readonly chatAuthService: ChatAuthService,
    private readonly cryptoService: CryptoService,
    private readonly userService: UserService,
  ) { }

  @Get("webhook")
  verifyWebhook(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ) {
    if (
      mode === "subscribe" &&
      token === apiConfiguration.WHATSAPP_VERIFY_TOKEN
    ) {
      console.log("✅ Webhook verified!");
      return res.status(HttpStatus.OK).send(challenge);
    }

    console.warn("❌ Webhook verification failed.");
    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  @Post("webhook")
  async receiveMessage(@Res() res: Response, @Body() body: any) {
    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (value?.statuses?.length) {
        const status = value.statuses[0];
        console.log(
          `📬 Status update ignored: ${status.status} for ${status.id}`,
        );
        return res.sendStatus(HttpStatus.OK);
      }

      const messages = value?.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.sendStatus(HttpStatus.OK);
      }

      const message = messages[0];

      const myBusinessId = value?.metadata?.phone_number_id;
      if (message.from === myBusinessId) {
        console.log("🟢 Ignored self-sent message");
        return res.sendStatus(HttpStatus.OK);
      }

      const ignoredTypes = ["reaction", "call_log", "sticker"];
      if (ignoredTypes.includes(message.type)) {
        console.log(`🟡 Ignored ${message.type} message`);
        return res.sendStatus(HttpStatus.OK);
      }

      const from = message.from;
      const messageId = message.id;
      const text = this.extractWhatsappMessageText(message);

      await this.whatsappService.sendTypingIndicator(messageId);

      if (text.startsWith("ringee-login-")) {
        await this.createOrIgnoreChatAuth(text, from);
      }

      const user = await this.guardAgainstUnauthorized(from);
      const userContext = (await this.getContext(from)) || [];
      const tools = this.mcpToolsRepository.getAllTools();

      const messagesForAI = [
        ...userContext,
        {
          role: "user",
          content: { type: "text", text },
        },
      ];

      const aiResponse = await this.aiService.generateWithTools({
        messages: messagesForAI,
        systemPrompt: buildSystemPrompt(user),
        tools,
      });

      if (aiResponse.type === "tool_call") {
        const { toolName, arguments: args } = aiResponse;
        console.log(`⚙️ AI solicitó ejecutar la tool: ${toolName}`, args);

        try {
          if (toolName === "SignIn" || toolName === "SignUp") {
            await this.whatsappService.sendReaction(
              from,
              messageId,
              WhatsappEmoji.COOL,
            );
          }

          const result = await this.mcpToolsRepository.exec(
            from,
            toolName,
            args,
          );

          if (result) {
            const items = result.map((item: any) => ({
              role: "assistant",
              content: item,
            }));

            await this.redisService.set(
              `${from}_context`,
              JSON.stringify([...messagesForAI, ...items]),
              minutes30ms,
            );
          }

          console.log(`✅ Tool "${toolName}" ejecutada con éxito.`, result);
        } catch (err) {
          console.error(`❌ Error ejecutando la tool "${toolName}":`, err);
          await this.whatsappService.sendText(
            from,
            `❌ Ocurrió un error al ejecutar la acción "${toolName}".`,
          );
        }
      } else if (aiResponse.type === "text" && aiResponse.text.trim()) {
        await this.whatsappService.sendText(from, aiResponse.text);
        await this.redisService.set(
          `${from}_context`,
          JSON.stringify([...messagesForAI, aiResponse]),
          minutes30ms,
        );
      }

      return res.sendStatus(HttpStatus.OK);
    } catch (error) {
      console.error("❌ Error handling WhatsApp message:", error);
      return res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async guardAgainstUnauthorized(phoneNumber: string) {
    const userInfo = await this.redisService.get<string>(`${phoneNumber}`);

    if (userInfo) {
      const user = JSON.parse(userInfo);

      if (user) {
        return user;
      }
    }

    const mySession = await this.chatAuthService.getByPhoneNumber(phoneNumber);

    if (mySession) {
      const { user, organizationId } = mySession;

      await this.redisService.set<string>(
        `${phoneNumber}`,
        JSON.stringify({ ...user, organizationId }),
        hours24ms,
      );

      return { ...user, organizationId };
    }

    return null;
  }

  private async getContext(phoneNumber: string) {
    const context = await this.redisService.get<string>(
      `${phoneNumber}_context`,
    );

    if (context) {
      return JSON.parse(context);
    }

    return null;
  }

  private extractWhatsappMessageText(message: any): string {
    if (!message) return "";

    switch (message.type) {
      case "text":
        return message?.text?.body?.trim() || "";

      case "interactive":
        const type = message.interactive?.type;
        if (type === "button_reply")
          return message.interactive.button_reply?.title?.trim() || "";
        if (type === "list_reply") {
          const title = message.interactive.list_reply?.title?.trim() || "";
          const desc = message.interactive.list_reply?.description?.trim();
          return desc ? `${title} - ${desc}` : title;
        }
        if (type === "cta_url")
          return `Tapped link: ${message.interactive.cta_url?.url || ""}`;
        if (type === "flow")
          return (
            message.interactive.flow_response?.body?.text?.trim() ||
            "Completed a flow form"
          );
        if (type === "location_request_message")
          return "Shared current location 📍";
        return "Selected an interactive element";

      case "template":
        return message.template?.name || "template_response";

      case "reaction":
        return `Reacted with ${message.reaction?.emoji || "emoji"}`;

      case "location":
        const { latitude, longitude, name, address } = message.location || {};
        return `Location: ${name || "Unknown"} (${latitude}, ${longitude}) ${address || ""
          }`.trim();

      case "image":
        return message.image?.caption?.trim() || "Sent an image 📷";

      case "video":
        return message.video?.caption?.trim() || "Sent a video 🎬";

      case "audio":
        return "Sent an audio 🎧";

      case "document":
        return `Sent a document 📄: ${message.document?.filename || "unnamed"}`;

      case "contacts":
        const contact = message.contacts?.[0];
        const cname =
          contact?.name?.formatted_name ||
          contact?.name?.first_name ||
          "Unknown";
        const phone =
          contact?.phones?.[0]?.wa_id ||
          contact?.phones?.[0]?.phone ||
          "unknown";
        return `Shared contact: ${cname} (${phone})`;

      case "sticker":
        return "Sent a sticker 🩵";

      case "address":
        return "Shared delivery address 🏠";

      case "call_log":
        return "Made or received a call 📞";

      default:
        return "[Unsupported message type]";
    }
  }

  private async createOrIgnoreChatAuth(rawHash: string, phoneNumber: string) {
    const [, hash] = rawHash.split("ringee-login-");

    if (!hash) {
      return;
    }

    const { u } = this.cryptoService.decrypt(hash);

    const user = await this.userService.getUserById(u);

    if (!user) {
      return null;
    }

    // Build ownership context from user - no organization for WhatsApp logins
    const ctx: OwnershipContext = {
      userId: user.id,
      organizationId: null,
    };

    await this.chatAuthService.createChatAuth(ctx, {
      phoneNumber,
    });

    return user;
  }
}
