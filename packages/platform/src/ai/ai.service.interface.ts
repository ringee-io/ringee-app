import { ChatCompletionTool } from "openai/resources/chat/completions";

export interface AiServiceInterface {
  generateWithTools({
    messages,
    systemPrompt,
    temperature,
    maxTokens,
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
  >;
}
