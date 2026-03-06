import OpenAI from "openai";
import { Injectable } from "@nestjs/common";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { apiConfiguration } from "@ringee/configuration";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { AiServiceInterface } from "../ai.service.interface";
import { getAiSystemPrompt } from "../ai.system.prompt";

dayjs.extend(utc);

const openai = new OpenAI({
  apiKey: apiConfiguration.OPENAI_API_KEY,
});

@Injectable()
export class OpenaiService implements AiServiceInterface {
  async generateWithTools({
    messages,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 500,
    tools,
  }: {
    messages: {
      role: "function" | "user" | "assistant" | "system" | "developer" | "tool";
      content: { type: "text"; text: string };
    }[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    tools: ChatCompletionTool[];
  }): Promise<
    | { type: "tool_call"; toolName: string; arguments: any }
    | { type: "text"; text: string }
  > {
    const newSystemPrompt = systemPrompt || getAiSystemPrompt();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature,
      max_tokens: maxTokens,
      tool_choice: "auto",
      tools,
      messages: [
        { role: "system" as const, content: newSystemPrompt },
        ...messages.map(
          (m) =>
            ({
              role: m.role,
              content: m.content.text,
            }) as ChatCompletionMessageParam,
        ),
      ],
    });

    const res = completion.choices[0];

    const toolCall = res.message.tool_calls?.[0];
    // @ts-expect-error
    if (toolCall?.function?.name && toolCall.function?.arguments) {
      try {
        return {
          type: "tool_call",
          // @ts-expect-error
          toolName: toolCall.function.name,
          // @ts-expect-error
          arguments: JSON.parse(toolCall.function.arguments),
        };
      } catch (err) {
        console.error(
          "Error parsing tool arguments:",
          // @ts-expect-error
          toolCall.function.arguments,
        );
        return {
          type: "text",
          text: "Hubo un error al intentar usar una herramienta. Intenta de nuevo.",
        };
      }
    }

    return {
      type: "text",
      text: res.message.content ?? "",
    };
  }
}
